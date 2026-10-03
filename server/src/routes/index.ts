import type { FastifyInstance } from "fastify";
import type { SocketStream } from "@fastify/websocket";
import { createSession, getSession, getSessionByToken, getLatestActiveSession } from "../session.js";
import { subscribe, publish } from "../bus.js";
import { runReplay } from "../replay.js";
import { intervene } from "../intervention.js";
import type { ClipId, Evidence } from "../events.js";
import { registerTwilioRoutes } from "./twilio.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/session — create a new session
  app.post("/api/session", async (_req, reply) => {
    const session = createSession();
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const contactUrl = `${baseUrl}/c/${session.contactToken}`;
    return reply.send({
      sessionId: session.id,
      contactToken: session.contactToken,
      contactUrl,
    });
  });

  // GET /api/session/active — returns the most recent non-ended session (for live call auto-connect)
  app.get("/api/session/active", async (_req, reply) => {
    const session = getLatestActiveSession();
    if (!session) return reply.send({ session: null });
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    return reply.send({
      session: {
        sessionId: session.id,
        contactUrl: `${baseUrl}/c/${session.contactToken}`,
      },
    });
  });

  // GET /api/session/:sessionId — session state snapshot
  app.get("/api/session/:sessionId", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = getSession(sessionId);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    return reply.send({
      id: session.id,
      state: session.state,
      score: session.score,
      categoriesAwarded: Array.from(session.categoriesAwarded),
      transcript: session.transcript,
      evidence: session.evidence ?? null,
      contactRecommendation: session.contactRecommendation ?? null,
    });
  });

  // POST /api/session/:sessionId/replay — start a replay
  app.post("/api/session/:sessionId/replay", async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = getSession(sessionId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    if (session.state !== "monitoring") {
      return reply.status(409).send({ error: "Session is not in monitoring state" });
    }

    const { fixture } = req.body as { fixture: string };

    // playClip for replay: intervention.ts publishes clip_result after this returns
    const playClip = async (_clipId: ClipId): Promise<"played" | "failed"> => {
      return "played";
    };

    // Start replay in background — do not await
    runReplay(session, fixture, playClip).catch(() => {
      // ignore background errors in demo
    });

    return reply.send({ ok: true });
  });

  // GET /c/:token — contact page data
  app.get("/c/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const session = getSessionByToken(token);
    if (!session || session.state === "ended") {
      return reply.status(404).send({ error: "Not found" });
    }

    return reply.send({
      sessionId: session.id,
      state: session.state,
      evidence: session.evidence ?? null,
      recommendation: session.contactRecommendation ?? null,
    });
  });

  // POST /c/:token/action — contact page action
  app.post("/c/:token/action", async (req, reply) => {
    const { token } = req.params as { token: string };
    const session = getSessionByToken(token);
    if (!session || session.state === "ended") {
      return reply.status(404).send({ error: "Not found" });
    }

    const { action } = req.body as { action: "end" | "review" };
    session.contactRecommendation = action;

    if (action === "end") {
      const evidence: Evidence = {
        triggerPath: "score",
        quotedLine: "Trusted contact recommended ending this call.",
      };
      const playClip = async (clipId: ClipId): Promise<"played" | "failed"> => {
        publish(session.id, { type: "clip_result", clipId, result: "played" });
        return "played";
      };
      await intervene(session, "contact-end-call", "score", evidence, playClip);
    }

    publish(session.id, { type: "contact_action", recommendation: action });

    return reply.send({ ok: true });
  });

  // GET /ws/:sessionId — WebSocket route
  app.get("/ws/:sessionId", { websocket: true }, (conn: SocketStream, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = getSession(sessionId);
    if (!session) {
      conn.socket.close();
      return;
    }

    subscribe(sessionId, conn);

    // Send full state snapshot so late-joining clients (live call auto-connect) catch up
    conn.socket.send(JSON.stringify({ type: "state_change", state: session.state }));
    conn.socket.send(JSON.stringify({
      type: "score_update",
      score: session.score,
      categoriesAwarded: Array.from(session.categoriesAwarded),
    }));
    for (const line of session.transcript) {
      conn.socket.send(JSON.stringify({ type: "transcript", line }));
    }
    if (session.evidence) {
      conn.socket.send(JSON.stringify({ type: "intervention", evidence: session.evidence }));
    }
  });

  await registerTwilioRoutes(app);
}
