import type { FastifyInstance } from "fastify";
import { scanInbox } from "../email/imap.js";

export async function registerEmailRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/email/scan", async (req, reply) => {
    const { email, password, limit } = req.body as {
      email: string;
      password: string;
      limit?: number;
    };
    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password required" });
    }
    try {
      const emails = await scanInbox(email, password, limit ?? 50);
      const flagged = emails.filter((e) => e.triggered).length;
      return reply.send({
        emails,
        scannedAt: new Date().toISOString(),
        total: emails.length,
        flagged,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      return reply.status(500).send({ error: msg });
    }
  });

  app.get("/api/email/health", async (_req, reply) => reply.send({ ok: true }));
}
