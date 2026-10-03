import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { createEngine } from "./engine/index.js";
import { analyzeConversation } from "./engine/gemini.js";
import { intervene } from "./intervention.js";
import { publish } from "./bus.js";
import { getSession } from "./session.js";
import type { Session, ClipId } from "./events.js";
import type { SocketStream } from "@fastify/websocket";

export function handleTwilioStream(
  conn: SocketStream,
  session: Session,
  playClip: (clip: ClipId) => Promise<"played" | "failed">
): void {
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
  const engine = createEngine();
  let streamSid: string | null = null;

  const dgConnection = deepgram.listen.live({
    model: "nova-2",
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    interim_results: true,
    endpointing: 300,
  });

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    // Suppress unused-variable warning for streamSid during the open handler
    void streamSid;

    conn.socket.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as {
        event: string;
        start?: { streamSid: string };
        media?: { track: string; payload: string };
      };
      if (msg.event === "start" && msg.start) {
        streamSid = msg.start.streamSid;
      } else if (msg.event === "media" && msg.media?.track === "inbound") {
        const audio = Buffer.from(msg.media.payload, "base64");
        dgConnection.send(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer);
      } else if (msg.event === "stop") {
        dgConnection.finish();
      }
    });
  });

  dgConnection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const alt = data?.channel?.alternatives?.[0];
    if (!alt?.transcript) return;

    const isFinal = data.is_final === true;
    const text = (alt.transcript as string).trim();
    if (!text) return;

    const currentSession = getSession(session.id);
    if (!currentSession || currentSession.state === "ended") return;

    const line = { text, isFinal, timestamp: new Date() };

    if (isFinal) {
      currentSession.transcript.push(line);
    }

    publish(session.id, { type: "transcript", line });

    if (!isFinal) return;

    const result = engine.processLine(text, true);
    currentSession.score = result.score;
    currentSession.categoriesAwarded = new Set(result.categoriesAwarded);
    publish(session.id, {
      type: "score_update",
      score: result.score,
      categoriesAwarded: result.categoriesAwarded,
    });

    if (result.triggered && result.triggerPath && result.clipId && result.evidence) {
      void intervene(currentSession, result.clipId, result.triggerPath, result.evidence, playClip);
    }

    // Gemini analyzes full conversation context (non-blocking, primary decision-maker)
    const recentLines = currentSession.transcript.slice(-6).map((l) => l.text);
    void (async () => {
      try {
        const analysis = await analyzeConversation(recentLines);
        if (!analysis) return;

        const sess = getSession(session.id);
        if (!sess || sess.state === "ended") return;

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

        if (analysis.isScam && analysis.confidence >= 0.75 && !sess.intervened) {
          const clipId = analysis.severity === "high" || analysis.categories.includes("payment")
            ? "warning-gift-card"
            : "warning-score";
          void intervene(sess, clipId, "score", {
            triggerPath: "score",
            quotedLine: analysis.reason || "Scam pattern detected",
          }, playClip);
        }
      } catch {
        // Gemini errors must never break the Twilio stream handler
      }
    })();
  });

  dgConnection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
    console.error("Deepgram error:", err);
  });

  conn.socket.on("close", () => {
    dgConnection.finish();
    const s = getSession(session.id);
    if (s && s.state !== "ended") {
      s.state = "ended";
      publish(session.id, { type: "session_ended" });
    }
  });
}
