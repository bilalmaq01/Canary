import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, "../../data/canary.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
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

export const queries = {
  getUserByEmail: db.prepare<[string], DbUser>("SELECT * FROM users WHERE email = ?"),
  getUserById: db.prepare<[string], DbUser>("SELECT * FROM users WHERE id = ?"),
  getFirstUser: db.prepare<[], DbUser>("SELECT * FROM users LIMIT 1"),
  getContacts: db.prepare<[string], DbContact>(
    "SELECT * FROM trusted_contacts WHERE user_id = ? ORDER BY created_at DESC"
  ),
  insertContact: db.prepare<[string, string, string, string], void>(
    "INSERT INTO trusted_contacts (id, user_id, name, phone) VALUES (?, ?, ?, ?)"
  ),
  deleteContact: db.prepare<[string, string], Database.RunResult>(
    "DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?"
  ),
  insertUser: db.prepare<[string, string, string, string, string | null], void>(
    "INSERT INTO users (id, email, password_hash, name, protected_phone) VALUES (?, ?, ?, ?, ?)"
  ),
};

export function getContactsByUserId(userId: string): DbContact[] {
  return queries.getContacts.all(userId);
}

export function createContact(userId: string, name: string, phone: string): DbContact {
  const id = randomUUID();
  queries.insertContact.run(id, userId, name, phone);
  return queries.getUserById.get(id) as unknown as DbContact;
}

export function deleteContact(id: string, userId: string): boolean {
  return queries.deleteContact.run(id, userId).changes > 0;
}

export async function seedAdminIfNeeded(): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const existing = queries.getUserByEmail.get(ADMIN_EMAIL);
  if (existing) return;

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  queries.insertUser.run(
    randomUUID(),
    ADMIN_EMAIL,
    hash,
    "Admin",
    process.env.PROTECTED_PHONE_NUMBER ?? null
  );
  console.log(`[db] Admin user created: ${ADMIN_EMAIL}`);
}
