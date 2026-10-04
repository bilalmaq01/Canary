import { createClient } from "@libsql/client";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, "../../data/canary.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = createClient({ url: `file:${dbPath}` });

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  protected_phone: string | null;
  created_at: number;
}

export interface DbContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  created_at: number;
}

export interface DbCallHistory {
  id: string;
  user_id: string;
  caller: string;
  session_type: string;
  started_at: number;
  ended_at: number;
  score: number;
  categories: string; // JSON array of category strings
  triggered: number; // 0 | 1
  trigger_path: string | null;
  evidence_quote: string | null;
  evidence_category: string | null;
  transcript: string; // JSON array of transcript lines
}

export async function initDb(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Admin',
      protected_phone TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS trusted_contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS call_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      caller TEXT NOT NULL,
      session_type TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      score INTEGER NOT NULL,
      categories TEXT NOT NULL,
      triggered INTEGER NOT NULL,
      trigger_path TEXT,
      evidence_quote TEXT,
      evidence_category TEXT,
      transcript TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_call_history_user ON call_history(user_id, ended_at DESC);
  `);
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const r = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
  return (r.rows[0] as unknown as DbUser) ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const r = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return (r.rows[0] as unknown as DbUser) ?? null;
}

export async function getFirstUser(): Promise<DbUser | null> {
  const r = await db.execute("SELECT * FROM users LIMIT 1");
  return (r.rows[0] as unknown as DbUser) ?? null;
}

export async function getContactsByUserId(userId: string): Promise<DbContact[]> {
  const r = await db.execute({
    sql: "SELECT * FROM trusted_contacts WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return r.rows as unknown as DbContact[];
}

export async function createContact(userId: string, name: string, phone: string): Promise<DbContact> {
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO trusted_contacts (id, user_id, name, phone) VALUES (?, ?, ?, ?)",
    args: [id, userId, name, phone],
  });
  const r = await db.execute({ sql: "SELECT * FROM trusted_contacts WHERE id = ?", args: [id] });
  return r.rows[0] as unknown as DbContact;
}

export async function deleteContact(id: string, userId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return (r.rowsAffected ?? 0) > 0;
}

export async function insertCallHistory(row: Omit<DbCallHistory, "id"> & { id?: string }): Promise<void> {
  const id = row.id ?? randomUUID();
  await db.execute({
    sql: `INSERT INTO call_history
      (id, user_id, caller, session_type, started_at, ended_at, score, categories, triggered, trigger_path, evidence_quote, evidence_category, transcript)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, row.user_id, row.caller, row.session_type, row.started_at, row.ended_at,
      row.score, row.categories, row.triggered, row.trigger_path, row.evidence_quote,
      row.evidence_category, row.transcript,
    ],
  });
}

export async function getCallHistoryByUserId(userId: string, limit = 50): Promise<DbCallHistory[]> {
  const r = await db.execute({
    sql: "SELECT * FROM call_history WHERE user_id = ? ORDER BY ended_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return r.rows as unknown as DbCallHistory[];
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string,
  phone: string | null
): Promise<string> {
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO users (id, email, password_hash, name, protected_phone) VALUES (?, ?, ?, ?, ?)",
    args: [id, email, passwordHash, name, phone],
  });
  return id;
}

export async function seedAdminIfNeeded(): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const existing = await getUserByEmail(ADMIN_EMAIL);
  if (existing) return;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await createUser(ADMIN_EMAIL, hash, "Admin", process.env.PROTECTED_PHONE_NUMBER ?? null);
  console.log(`[db] Admin user created: ${ADMIN_EMAIL}`);
}
