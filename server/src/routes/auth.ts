import { randomUUID } from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUserByEmail, getUserById, createUser } from "../db/index.js";
import type { DbUser } from "../db/index.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "canary-dev-secret-change-in-prod";
export const COOKIE_NAME = "canary_auth";

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export async function getUserFromRequest(req: FastifyRequest): Promise<DbUser | null> {
  const token = (req.cookies as Record<string, string>)?.[COOKIE_NAME];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return getUserById(payload.userId);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (req, reply) => {
    const { name, email, password, phone } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };
    if (!name?.trim() || !email?.trim() || !password) {
      return reply.status(400).send({ error: "Name, email, and password are required" });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: "Password must be at least 8 characters" });
    }

    const existing = await getUserByEmail(email.trim().toLowerCase());
    if (existing) return reply.status(409).send({ error: "An account with that email already exists" });

    const hash = await bcrypt.hash(password, 12);
    const id = await createUser(
      email.trim().toLowerCase(),
      hash,
      name.trim(),
      phone?.trim() || null
    );

    const token = signToken(id);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return reply.status(201).send({ ok: true });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.status(400).send({ error: "Email and password required" });

    const user = await getUserByEmail(email);
    if (!user) return reply.status(401).send({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.status(401).send({ error: "Invalid credentials" });

    const token = signToken(user.id);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      protectedPhone: user.protected_phone,
    });
  });
}
