export interface EmailRecord {
  uid: number;
  from: string;
  fromName: string;
  fromDomain: string;
  subject: string;
  date: string;
  bodyText: string;
  riskScore: number;
  flags: EmailFlag[];
  triggered: boolean;
  geminiQuote?: string;
  geminiScamType?: string;
}

export interface EmailFlag {
  type: "domain_mismatch" | "payment" | "access" | "urgency" | "secrecy" | "authority" | "romance" | "phishing";
  detail: string;
  severity: "high" | "medium" | "low";
}
