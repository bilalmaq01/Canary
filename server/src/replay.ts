import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createEngine } from "./engine/index.js";
import { analyzeConversation, clipForCategories } from "./engine/gemini.js";
import { intervene } from "./intervention.js";
import { publish } from "./bus.js";
import { getSession } from "./session.js";
import { persistCall } from "./call-history.js";
import type { Session, ClipId } from "./events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runReplay(
  session: Session,
  fixtureName: string,
  playClip: (clip: ClipId) => Promise<"played" | "failed">
): Promise<void> {
  const fixturePath = join(__dirname, "../fixtures", `${fixtureName}.json`);
  let lines: string[];
  try {
    lines = JSON.parse(readFileSync(fixturePath, "utf-8"));
  } catch {
    return;
  }

  const engine = createEngine();
  session.sessionType = "replay";

  for (const text of lines) {
    const currentSession = getSession(session.id)!; // re-fetch in case state changed
    if (currentSession.state === "ended") break;

    // Run through engine first so we can annotate the line
    const prevCats = new Set(currentSession.categoriesAwarded);
    const result = engine.processLine(text, true);
    const newCats = result.categoriesAwarded.filter((c) => !prevCats.has(c));

    // Keep server-side session in sync with engine state
    currentSession.score = result.score;
    currentSession.categoriesAwarded = new Set(result.categoriesAwarded);

    // Publish as transcript line with triggered categories
    const line = {
      text,
      isFinal: true,
      timestamp: new Date(),
      ...(newCats.length > 0 && { triggeredCategories: newCats }),
    };
    currentSession.transcript.push(line);
    publish(currentSession.id, { type: "transcript", line });

    // Publish score update
    publish(currentSession.id, {
      type: "score_update",
      score: result.score,
      categoriesAwarded: result.categoriesAwarded,
    });

    // Check for trigger
    if (result.triggered && result.triggerPath && result.clipId && result.evidence) {
      await intervene(currentSession, result.clipId, result.triggerPath, result.evidence, playClip);
    }

    // Gemini analyzes the full conversation context (non-blocking, primary decision-maker)
    const recentLines = currentSession.transcript.slice(-10).map((l) => l.text);
    void (async () => {
      try {
        const analysis = await analyzeConversation(recentLines, {
          score: currentSession.score,
          categories: Array.from(currentSession.categoriesAwarded),
        });
        if (!analysis) return;

        const sess = getSession(session.id);
        if (!sess || sess.state === "ended") return;

        // Add any new categories Gemini detected to the score
        for (const cat of analysis.categories) {
          const r = engine.addGeminiEvidence(cat);
          sess.score = r.score;
          sess.categoriesAwarded = new Set(r.categoriesAwarded);
        }

        // Always sync the dashboard before intervention so score/chips are current
        publish(sess.id, {
          type: "score_update",
          score: sess.score,
          categoriesAwarded: Array.from(sess.categoriesAwarded),
        });

        // Gemini makes the call: confidence >= 0.70 → intervene
        if (analysis.isScam && analysis.confidence >= 0.70 && !sess.intervened) {
          const clipId = clipForCategories(analysis.categories, analysis.severity);
          await intervene(sess, clipId, "score", {
            triggerPath: "score",
            quotedLine: analysis.quotedLine || analysis.reason || "Scam pattern detected",
          }, playClip);
        }
      } catch {
        // Gemini errors must never break the replay loop
      }
    })();

    await sleep(1500);
  }

  // End session
  const finalSession = getSession(session.id);
  if (finalSession && finalSession.state !== "ended") {
    finalSession.state = "ended";
    publish(finalSession.id, { type: "session_ended" });
  }
  if (finalSession) await persistCall(finalSession);
}
