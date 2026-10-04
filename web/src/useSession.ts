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
  sessionType: "replay" | "live" | null;
  lineType?: string;
  agentJoined: boolean;
}

const INITIAL_DATA: SessionData = {
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
  sessionType: null,
  agentJoined: false,
};

export function useSession() {
  const [data, setData] = useState<SessionData>(INITIAL_DATA);
  const [scoreFlash, setScoreFlash] = useState(false);
  const scoreFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isStartingRef = useRef(false);
  // Session the user manually dismissed via Reset — the live-call poll must not
  // re-attach to it (it may still be running/ended-pending on the server).
  const dismissedRef = useRef<string | null>(null);

  const connectWs = useCallback((sessionId: string, contactUrl: string, type: "replay" | "live") => {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/${sessionId}`);
    wsRef.current = ws;

    let opened = false;
    ws.onopen = () => {
      opened = true;
      setData((d) => ({ ...d, sessionId, contactUrl, wsConnected: true, sessionType: type }));
    };
    ws.onclose = () => {
      setData((d) => ({ ...d, wsConnected: false }));
      if (!opened) isStartingRef.current = false;
    };

    ws.onmessage = (e) => {
      const event: ServerEvent = JSON.parse(e.data as string) as ServerEvent;
      setData((d) => {
        const next = handleEvent(d, event);
        if (event.type === "score_update" && next.score > d.score) {
          if (scoreFlashTimerRef.current !== null) clearTimeout(scoreFlashTimerRef.current);
          setScoreFlash(true);
          scoreFlashTimerRef.current = setTimeout(() => {
            setScoreFlash(false);
            scoreFlashTimerRef.current = null;
          }, 600);
        }
        return next;
      });
    };

    return ws;
  }, []);

  const startSession = useCallback(async (fixture: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) { isStartingRef.current = false; return; }
      const { sessionId, contactUrl } = await res.json() as { sessionId: string; contactUrl: string };

      const ws = connectWs(sessionId, contactUrl, "replay");

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) { clearInterval(check); resolve(); }
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            clearInterval(check); isStartingRef.current = false; resolve();
          }
        }, 50);
      });

      await fetch(`/api/session/${sessionId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture }),
      });
    } catch {
      isStartingRef.current = false;
    }
  }, [connectWs]);

  const reset = useCallback(() => {
    isStartingRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    setData((d) => {
      if (d.sessionId) dismissedRef.current = d.sessionId;
      return INITIAL_DATA;
    });
  }, []);

  // Poll for incoming live calls when idle
  useEffect(() => {
    if (data.sessionId !== null) return;

    const poll = async () => {
      if (isStartingRef.current) return;
      try {
        const res = await fetch("/api/session/active");
        const { session } = await res.json() as { session: { sessionId: string; contactUrl: string } | null };
        if (!session) return;
        if (session.sessionId === dismissedRef.current) return; // user cleared this one
        isStartingRef.current = true;
        connectWs(session.sessionId, session.contactUrl, "live");
      } catch {}
    };

    const id = setInterval(() => { void poll(); }, 2000);
    return () => clearInterval(id);
  }, [data.sessionId, connectWs]);

  useEffect(() => {
    if (!data.lastClipResult || data.lastClipResult.result !== "played") return;
    const audio = new Audio(`/audio/${data.lastClipResult.clipId}.mp3`);
    audio.play().catch(() => {});
  }, [data.lastClipResult]);

  useEffect(() => {
    return () => {
      if (scoreFlashTimerRef.current !== null) clearTimeout(scoreFlashTimerRef.current);
    };
  }, []);

  return { data, scoreFlash, startSession, reset };
}

function handleEvent(d: SessionData, event: ServerEvent): SessionData {
  switch (event.type) {
    case "transcript": {
      // Update existing line if same text+isFinal already in transcript (category annotation update)
      const existing = d.transcript.findIndex(
        (l) => l.isFinal === event.line.isFinal && l.text === event.line.text
      );
      if (existing !== -1 && event.line.triggeredCategories) {
        const updated = [...d.transcript];
        updated[existing] = event.line;
        return { ...d, transcript: updated };
      }
      return { ...d, transcript: [...d.transcript, event.line] };
    }
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
    case "voip_info":
      return { ...d, lineType: event.lineType };
    case "agent_joined":
      return { ...d, agentJoined: true };
    default:
      return d;
  }
}
