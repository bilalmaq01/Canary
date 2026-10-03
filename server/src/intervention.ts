import { publish } from "./bus.js";
import type { Session, ClipId, TriggerPath, Evidence } from "./events.js";

export async function intervene(
  session: Session,
  clipId: ClipId,
  triggerPath: TriggerPath,
  evidence: Evidence,
  playClip: (clip: ClipId) => Promise<"played" | "failed">
): Promise<void> {
  if (session.intervened) return;
  session.intervened = true;
  session.state = "warning";
  session.evidence = evidence;

  publish(session.id, {
    type: "intervention",
    clipId,
    triggerPath,
    evidence,
  });
  publish(session.id, { type: "state_change", state: "warning" });

  const result = await playClip(clipId);
  publish(session.id, { type: "clip_result", clipId, result });

  // Move to contact_review after warning plays
  session.state = "contact_review";
  publish(session.id, { type: "state_change", state: "contact_review" });
}
