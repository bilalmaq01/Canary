export type SessionState = "monitoring" | "warning" | "contact_review" | "ended";

export type TriggerPath = "high_risk" | "score";

export type Category = "payment" | "access" | "secrecy" | "authority" | "urgency";

export const CATEGORY_POINTS: Record<Category, number> = {
  payment: 30,
  access: 30,
  secrecy: 25,
  authority: 20,
  urgency: 15,
};

export type ClipId =
  | "warning-gift-card"
  | "warning-remote-access"
  | "warning-login-code"
  | "warning-score"
  | "warning-fallback"
  | "contact-end-call";

export interface TranscriptLine {
  text: string;
  isFinal: boolean;
  timestamp: Date;
  triggeredCategories?: Category[];
}

export interface Evidence {
  triggerPath: TriggerPath;
  category?: Category;
  quotedLine: string;
}

export interface Session {
  id: string;
  state: SessionState;
  contactToken: string;
  intervened: boolean;
  score: number;
  categoriesAwarded: Set<Category>;
  transcript: TranscriptLine[];
  evidence?: Evidence;
  contactRecommendation?: "end" | "review";
  startedAt: Date;
  lineType?: string;
  trustedContactPhone?: string;
  contactUrl?: string;
  userId?: string;
  victimCallSid?: string;
  callerCallSid?: string;
  callerNumber?: string;
  sessionType?: "live" | "replay";
  persisted?: boolean;
}

export interface CallSource {
  kind: "replay" | "twilio";
  start(session: Session): Promise<void>;
  onFinalLine(cb: (text: string) => void): void;
  onInterimLine?(cb: (text: string) => void): void;
  play(clip: ClipId): Promise<"played" | "failed">;
  onEnd(cb: () => void): void;
}

export type ServerEvent =
  | { type: "transcript"; line: TranscriptLine }
  | { type: "score_update"; score: number; categoriesAwarded: Category[] }
  | { type: "state_change"; state: SessionState }
  | { type: "intervention"; clipId: ClipId; triggerPath: TriggerPath; evidence: Evidence }
  | { type: "clip_result"; clipId: ClipId; result: "played" | "failed" }
  | { type: "contact_action"; recommendation: "end" | "review" }
  | { type: "session_ended" }
  | { type: "voip_info"; lineType: string }
  | { type: "agent_joined" };

export type ClientEvent =
  | { type: "start_replay"; fixture: string }
  | { type: "ping" };
