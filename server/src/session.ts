import { nanoid } from "nanoid";
import type { Session, SessionState } from "./events.js";

const sessions = new Map<string, Session>();
const tokenIndex = new Map<string, string>(); // token → sessionId

export function createSession(): Session {
  const id = nanoid();
  const contactToken = nanoid(32);
  const session: Session = {
    id,
    state: "monitoring",
    contactToken,
    intervened: false,
    score: 0,
    categoriesAwarded: new Set(),
    transcript: [],
    startedAt: new Date(),
  };
  sessions.set(id, session);
  tokenIndex.set(contactToken, id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionByToken(token: string): Session | undefined {
  const id = tokenIndex.get(token);
  return id ? sessions.get(id) : undefined;
}

export function getLatestActiveSession(): Session | undefined {
  let latest: Session | undefined;
  for (const session of sessions.values()) {
    if (session.state !== "ended") {
      if (!latest || session.startedAt > latest.startedAt) {
        latest = session;
      }
    }
  }
  return latest;
}

export function endSession(id: string): void {
  const session = sessions.get(id);
  if (session) {
    tokenIndex.delete(session.contactToken);
    session.state = "ended";
  }
}
