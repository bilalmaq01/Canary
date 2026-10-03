import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createEngine } from "./engine/index.js";
import { intervene } from "./intervention.js";
import { publish } from "./bus.js";
import { getSession } from "./session.js";
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

  for (const text of lines) {
    const currentSession = getSession(session.id)!; // re-fetch in case state changed
    if (currentSession.state === "ended") break;

    // Publish as transcript line
    const line = { text, isFinal: true, timestamp: new Date() };
    currentSession.transcript.push(line);
    publish(currentSession.id, { type: "transcript", line });

    // Run through engine
    const result = engine.processLine(text, true);

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

    await sleep(1500);
  }

  // End session
  if (getSession(session.id)?.state !== "ended") {
    const finalSession = getSession(session.id)!;
    finalSession.state = "ended";
    publish(finalSession.id, { type: "session_ended" });
  }
}
