import { useState, useEffect, useRef, useCallback } from "react";
import type { SessionState, ServerEvent, TranscriptLine, Evidence, Category, ClipId } from "./types";

export interface SessionData {
  sessionId: string | null;
  contactUrl: string | null;
  state: SessionState;
  score: number;
  categoriesAwarded: Category[];
  transcript: TranscriptLine[];
  evidence: Evidence | null;
  contactRecommendation: "end" | "review" | null;
  lastClipResult: { clipId: ClipId; result: "played" | "failed" } | null;
  wsConnected: boolean;
}

export function useSession() {
  const [data, setData] = useState<SessionData>({
    sessionId: null,
    contactUrl: null,
    state: "monitoring",
    score: 0,
    categoriesAwarded: [],
    transcript: [],
    evidence: null,
    contactRecommendation: null,
    lastClipResult: null,
    wsConnected: false,
  });

  const wsRef = useRef<WebSocket | null>(null);

  const startSession = useCallback(async (fixture: string) => {
    const res = await fetch("/api/session", { method: "POST" });
    const { sessionId, contactUrl } = await res.json() as { sessionId: string; contactUrl: string };

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setData((d) => ({ ...d, sessionId, contactUrl, wsConnected: true }));
    ws.onclose = () => setData((d) => ({ ...d, wsConnected: false }));

    ws.onmessage = (e) => {
      const event: ServerEvent = JSON.parse(e.data as string) as ServerEvent;
      setData((d) => handleEvent(d, event));
    };

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    await fetch(`/api/session/${sessionId}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture }),
    });
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setData({
      sessionId: null,
      contactUrl: null,
      state: "monitoring",
      score: 0,
      categoriesAwarded: [],
      transcript: [],
      evidence: null,
      contactRecommendation: null,
      lastClipResult: null,
      wsConnected: false,
    });
  }, []);

  useEffect(() => {
    if (!data.lastClipResult || data.lastClipResult.result !== "played") return;
    const clipId = data.lastClipResult.clipId;
    const audio = new Audio(`/audio/${clipId}.mp3`);
    audio.play().catch(() => {});
  }, [data.lastClipResult]);

  return { data, startSession, reset };
}

function handleEvent(d: SessionData, event: ServerEvent): SessionData {
  switch (event.type) {
    case "transcript":
      return { ...d, transcript: [...d.transcript, event.line] };
    case "score_update":
      return { ...d, score: event.score, categoriesAwarded: event.categoriesAwarded };
    case "state_change":
      return { ...d, state: event.state };
    case "intervention":
      return { ...d, evidence: event.evidence };
    case "clip_result":
      return { ...d, lastClipResult: { clipId: event.clipId, result: event.result } };
    case "contact_action":
      return { ...d, contactRecommendation: event.recommendation };
    case "session_ended":
      return { ...d, state: "ended" };
    default:
      return d;
  }
}
