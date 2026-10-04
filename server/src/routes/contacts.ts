import type { FastifyInstance } from "fastify";
import { getContactsByUserId, createContact, deleteContact } from "../db/index.js";
import { getUserFromRequest } from "./auth.js";

export async function registerContactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/contacts", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    return reply.send(await getContactsByUserId(user.id));
  });

  app.post("/api/contacts", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { name, phone } = req.body as { name?: string; phone?: string };
    if (!name?.trim() || !phone?.trim()) {
      return reply.status(400).send({ error: "Name and phone required" });
    }

    const normalised = phone.replace(/[\s\-().]/g, "");
    const e164 = normalised.startsWith("+") ? normalised : `+1${normalised}`;

    const contact = await createContact(user.id, name.trim(), e164);
    return reply.status(201).send(contact);
  });

  app.delete("/api/contacts/:id", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { id } = req.params as { id: string };
    const deleted = await deleteContact(id, user.id);
    if (!deleted) return reply.status(404).send({ error: "Not found" });
    return reply.send({ ok: true });
  });
}
