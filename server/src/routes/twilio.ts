import type { FastifyInstance } from "fastify";
import twilio from "twilio";
import { createSession, getSession } from "../session.js";
import { handleTwilioStream } from "../twilio-source.js";
import { publish } from "../bus.js";
import type { ClipId } from "../events.js";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  PROTECTED_PHONE_NUMBER,
  BASE_URL,
} = process.env;

export async function registerTwilioRoutes(app: FastifyInstance): Promise<void> {
  // POST /twilio/voice — called by Twilio when someone dials our number
  app.post("/twilio/voice", async (req, reply) => {
    // Validate Twilio signature
    if (TWILIO_AUTH_TOKEN && BASE_URL) {
      const signature = req.headers["x-twilio-signature"] as string;
      const url = `${BASE_URL}/twilio/voice`;
      const params = req.body as Record<string, string>;
      const valid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params);
      if (!valid) {
        reply.code(403).send("Forbidden");
        return;
      }
    }

    const session = createSession();
    const callerNumber = (req.body as any).From as string;

    // TwiML: start media stream (caller audio only) + join conference
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="wss://${new URL(BASE_URL!).host}/twilio/stream/${session.id}" track="inbound_track" />
  </Start>
  <Dial>
    <Conference>${"conf-" + session.id}</Conference>
  </Dial>
</Response>`;

    reply.header("Content-Type", "text/xml").send(twiml);

    // Dial the protected user into the conference (no stream)
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && PROTECTED_PHONE_NUMBER) {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      try {
        await client.calls.create({
          to: PROTECTED_PHONE_NUMBER,
          from: TWILIO_PHONE_NUMBER,
          twiml: `<Response><Dial><Conference>${"conf-" + session.id}</Conference></Dial></Response>`,
        });
      } catch (e) {
        console.error("Failed to dial protected user:", e);
      }
    }

    // VoIP badge: async lookup — must never block the call
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && callerNumber) {
      const lookupClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      void lookupClient.lookups.v2.phoneNumbers(callerNumber)
        .fetch({ fields: "line_type_intelligence" })
        .then((data) => {
          const lineType = (data as any).lineTypeIntelligence?.type as string | undefined;
          if (lineType) {
            session.lineType = lineType;
            publish(session.id, { type: "voip_info", lineType });
          }
        })
        .catch(() => {});
    }
  });

  // WebSocket: /twilio/stream/:sessionId — receives mu-law audio from Twilio
  app.get("/twilio/stream/:sessionId", { websocket: true }, (conn, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = getSession(sessionId);
    if (!session) {
      conn.socket.close();
      return;
    }

    // playClip for live calls: use Twilio conference announce
    const playClip = async (clipId: ClipId): Promise<"played" | "failed"> => {
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

        // Dial in the ElevenLabs challenge agent if configured
        const agentNumber = process.env.ELEVENLABS_AGENT_NUMBER;
        if (agentNumber && TWILIO_PHONE_NUMBER) {
          try {
            await client.calls.create({
              to: agentNumber,
              from: TWILIO_PHONE_NUMBER,
              twiml: `<Response><Dial><Conference>${"conf-" + sessionId}</Conference></Dial></Response>`,
            });
            publish(sessionId, { type: "agent_joined" });
          } catch (e) {
            console.error("Failed to dial ElevenLabs agent:", e);
          }
        }

        return "played";
      } catch (e) {
        console.error("Conference announce failed:", e);
        return "failed";
      }
    };

    handleTwilioStream(conn, session, playClip);
  });

  // POST /twilio/status — optional: handle call status callbacks
  app.post("/twilio/status", async (_req, reply) => {
    // Session cleanup handled by stream close event
    reply.send("ok");
  });
}
