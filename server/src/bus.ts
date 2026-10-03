import type { ServerEvent } from "./events.js";
import type { SocketStream } from "@fastify/websocket";

const clients = new Map<string, Set<SocketStream>>();

export function subscribe(sessionId: string, conn: SocketStream): void {
  if (!clients.has(sessionId)) clients.set(sessionId, new Set());
  clients.get(sessionId)!.add(conn);
  conn.socket.on("close", () => {
    clients.get(sessionId)?.delete(conn);
  });
}

export function publish(sessionId: string, event: ServerEvent): void {
  const payload = JSON.stringify(event);
  clients.get(sessionId)?.forEach((conn) => {
    if (conn.socket.readyState === 1) conn.socket.send(payload);
  });
}

export function cleanup(sessionId: string): void {
  clients.delete(sessionId);
}
