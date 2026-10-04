import { insertCallHistory } from "./db/index.js";
import type { Session } from "./events.js";

// Persist a finished call to history. Idempotent per session (guards against the
// caller-hangup and victim-hangup webhooks both firing for one call). Only calls
// tied to a user account are saved; anonymous/unauthenticated sessions are skipped.
export async function persistCall(session: Session): Promise<void> {
  if (session.persisted || !session.userId) return;
  session.persisted = true;

  try {
    await insertCallHistory({
      user_id: session.userId,
      caller: session.callerNumber ?? (session.sessionType === "replay" ? "Simulated call" : "Unknown"),
      session_type: session.sessionType ?? "live",
      started_at: Math.floor(session.startedAt.getTime() / 1000),
      ended_at: Math.floor(Date.now() / 1000),
      score: session.score,
      categories: JSON.stringify(Array.from(session.categoriesAwarded)),
      triggered: session.intervened ? 1 : 0,
      trigger_path: session.evidence?.triggerPath ?? null,
      evidence_quote: session.evidence?.quotedLine ?? null,
      evidence_category: session.evidence?.category ?? null,
      transcript: JSON.stringify(session.transcript),
    });
  } catch (e) {
    // History persistence must never break call teardown.
    session.persisted = false;
    console.error("Failed to persist call history:", e);
  }
}
