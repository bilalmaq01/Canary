import twilio from "twilio";
import type { ClipId } from "./events.js";

// Play an audio clip into a session's live Twilio conference, so everyone on the
// call (including the protected user) hears it on the phone line. Returns
// "failed" when Twilio isn't configured or the conference isn't in progress
// (e.g. a replay/demo session with no real call) — the caller falls back to a
// dashboard-only notification in that case.
export async function announceToConference(
  sessionId: string,
  clipId: ClipId
): Promise<"played" | "failed"> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, BASE_URL } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !BASE_URL) return "failed";

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const confName = "conf-" + sessionId;
  try {
    const conferences = await client.conferences.list({
      friendlyName: confName,
      status: "in-progress",
    });
    if (!conferences.length) return "failed";
    await client.conferences(conferences[0].sid).update({
      announceUrl: `${BASE_URL}/audio/${clipId}.mp3`,
      announceMethod: "GET",
    });
    return "played";
  } catch (e) {
    console.error("Conference announce failed:", e);
    return "failed";
  }
}
