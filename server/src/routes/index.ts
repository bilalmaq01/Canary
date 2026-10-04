import type { FastifyInstance } from "fastify";
import type { SocketStream } from "@fastify/websocket";
import { createSession, getSession, getSessionByToken, getLatestActiveSession } from "../session.js";
import { subscribe, publish } from "../bus.js";
import { runReplay } from "../replay.js";
import { intervene } from "../intervention.js";
import type { ClipId, Evidence } from "../events.js";
import { registerTwilioRoutes } from "./twilio.js";
import { registerEmailRoutes } from "./email.js";
import { registerAuthRoutes, getUserFromRequest } from "./auth.js";
import { registerContactRoutes } from "./contacts.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerAuthRoutes(app);
  await registerContactRoutes(app);

  // POST /api/session — create a new session (requires auth)
  app.post("/api/session", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const session = createSession();
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const contactUrl = `${baseUrl}/c/${session.contactToken}`;
    session.contactUrl = contactUrl;
    session.userId = user.id;
    return reply.send({
      sessionId: session.id,
      contactToken: session.contactToken,
      contactUrl,
    });
  });

  // GET /api/call-history — past calls for the signed-in user (most recent first)
  app.get("/api/call-history", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const { getCallHistoryByUserId } = await import("../db/index.js");
    const rows = await getCallHistoryByUserId(user.id);
    return reply.send(
      rows.map((r) => ({
        id: r.id,
        caller: r.caller,
        sessionType: r.session_type,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        score: r.score,
        categoriesAwarded: JSON.parse(r.categories) as string[],
        triggered: r.triggered === 1,
        triggerPath: r.trigger_path,
        evidence: r.evidence_quote
          ? { quotedLine: r.evidence_quote, category: r.evidence_category }
          : null,
        transcript: JSON.parse(r.transcript) as unknown[],
      }))
    );
  });

  // DELETE /api/call-history/:id — delete one past call (own rows only)
  app.delete("/api/call-history/:id", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const { id } = req.params as { id: string };
    const { deleteCallHistory } = await import("../db/index.js");
    const ok = await deleteCallHistory(id, user.id);
    if (!ok) return reply.status(404).send({ error: "Not found" });
    return reply.send({ ok: true });
  });

  // DELETE /api/call-history — clear all of the user's call history
  app.delete("/api/call-history", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const { clearCallHistory } = await import("../db/index.js");
    const deleted = await clearCallHistory(user.id);
    return reply.send({ ok: true, deleted });
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

  // GET /api/c/:token — contact page data (the page itself is served by the SPA
  // at /c/:token; the data must live under /api so it doesn't shadow that route).
  app.get("/api/c/:token", async (req, reply) => {
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

  // POST /api/c/:token/action — contact page action
  app.post("/api/c/:token/action", async (req, reply) => {
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

  // POST /api/c/:token/optin — trusted contact opts in to SMS alerts
  app.post("/api/c/:token/optin", async (req, reply) => {
    const { token } = req.params as { token: string };
    const session = getSessionByToken(token);
    if (!session || session.state === "ended") {
      return reply.status(404).send({ error: "Not found" });
    }
    const { phone } = req.body as { phone: string };
    if (!phone || !/^\+?[\d\s\-().]{7,15}$/.test(phone.trim())) {
      return reply.status(400).send({ error: "Invalid phone number" });
    }
    // Normalise to E.164-ish — strip spaces/dashes/parens, ensure leading +
    const normalised = phone.replace(/[\s\-().]/g, "");
    session.trustedContactPhone = normalised.startsWith("+") ? normalised : `+1${normalised}`;
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
  await registerEmailRoutes(app);
}
