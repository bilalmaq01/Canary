export type SessionState = "monitoring" | "warning" | "contact_review" | "ended";
export type TriggerPath = "high_risk" | "score";
export type Category = "payment" | "access" | "secrecy" | "authority" | "urgency";
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
  timestamp: string;
  triggeredCategories?: Category[];
}

export interface Evidence {
  triggerPath: TriggerPath;
  category?: Category;
  quotedLine: string;
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
