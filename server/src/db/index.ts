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
