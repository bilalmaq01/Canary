import twilio from "twilio";
import { publish } from "./bus.js";
import { getContactsByUserId } from "./db/index.js";
import type { DbContact } from "./db/index.js";
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

  // SMS alert to trusted contact (fire-and-forget, never blocks the call)
  void sendSmsAlert(session, evidence);
}

async function sendSmsAlert(session: Session, evidence: Evidence): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !session.contactUrl) return;

  // Collect recipients: saved DB contacts + any QR opt-in
  const phones: string[] = [];
  if (session.userId) {
    const dbContacts: DbContact[] = await getContactsByUserId(session.userId);
    phones.push(...dbContacts.map((c) => c.phone));
  }
  if (session.trustedContactPhone && !phones.includes(session.trustedContactPhone)) {
    phones.push(session.trustedContactPhone);
  }
  if (phones.length === 0) return;

  const quote = evidence.quotedLine?.slice(0, 80) ?? "Scam pattern detected";
  const body =
    `🐦 Canary AI Alert: A potential scam call is in progress.\n` +
    `Caller said: "${quote}"\n` +
    `Review and advise: ${session.contactUrl}\n` +
    `Reply STOP to opt out. Msg & data rates may apply.`;

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  await Promise.allSettled(
    phones.map((to) =>
      client.messages.create({ to, from: TWILIO_PHONE_NUMBER, body }).catch((e) => {
        console.error(`SMS to ${to} failed:`, e);
      })
    )
  );
}
