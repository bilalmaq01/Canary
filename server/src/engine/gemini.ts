import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Category } from "../events.js";

export interface GeminiAnalysis {
  isScam: boolean;
  confidence: number;
  categories: Category[];
  severity: "low" | "medium" | "high";
  reason: string;
}

const VALID_CATEGORIES: Category[] = ["payment", "access", "secrecy", "authority", "urgency"];

const PROMPT_HEADER = `You are Canary AI, a real-time fraud detection system built to protect elderly and vulnerable people from phone scams.

Your job: analyze the caller's side of a phone call and decide if this is a scam.

COMMON SCAM PATTERNS:
• Government impersonation — caller claims to be IRS, Social Security Administration, Medicare, FBI, DEA, sheriff, or police to threaten arrest or demand immediate payment
• Gift card demands — any request to buy gift cards (iTunes, Google Play, Amazon, Walmart, Target, CVS, Steam, etc.) and read back the codes
• Remote access scams — requests to install software (TeamViewer, AnyDesk), share screen, or provide login/verification/one-time codes
• Secrecy demands — instructions NOT to tell family, bank, lawyer, or anyone else about the call or transaction
• Fake emergencies — claiming account suspended, warrant issued, lawsuit filed, Social Security number compromised, or money stolen
• Wire/crypto transfers — requests to wire money, send cryptocurrency, or use Western Union, MoneyGram, Zelle, Cash App
• Prize/lottery scams — claiming winnings or inheritance that require an upfront fee

CATEGORIES (return only the ones that clearly apply):
- "payment": Requesting gift cards, wire transfers, crypto, money orders, prepaid cards, or any unusual payment
- "access": Remote desktop tools, login codes, OTPs, verification codes, passwords, or computer access
- "secrecy": Instructions to hide the call or payment from family, banks, lawyers, or anyone
- "authority": False claims of being a government agency, law enforcement, or official institution
- "urgency": Artificial time pressure, threats of arrest/lawsuit/account suspension, consequences for not acting now

TRANSCRIPT OF MOST RECENT CALLER LINES:`;

const PROMPT_FOOTER = `
Evaluate whether this is a scam based solely on what the caller said.

Return ONLY valid JSON with no markdown or extra text:
{
  "isScam": true or false,
  "confidence": number 0.0–1.0,
  "categories": [],
  "severity": "low" | "medium" | "high",
  "reason": "one phrase under 12 words"
}

CONFIDENCE GUIDE:
- 0.90+: Multiple unmistakable scam signals
- 0.75–0.89: Strong scam pattern, likely a scam
- 0.55–0.74: Suspicious but could be legitimate
- below 0.55: Insufficient evidence, probably benign

SEVERITY:
- "high": Immediate threat — gift card codes requested, arrest threatened, active remote access demand
- "medium": Clear scam pattern building — payment method named, authority claim + demand present
- "low": Early warning signals only`;

export async function analyzeConversation(lines: string[]): Promise<GeminiAnalysis | null> {
  if (!process.env.GEMINI_API_KEY || lines.length === 0) return null;

  const transcriptBlock = lines.map((l, i) => `[${i + 1}] "${l}"`).join("\n");
  const prompt = `${PROMPT_HEADER}\n${transcriptBlock}\n${PROMPT_FOOTER}`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);

    const raw = result.response.text().trim();
    const jsonStr = raw.startsWith("{") ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const categories = Array.isArray(parsed.categories)
      ? (parsed.categories as unknown[]).filter(
          (c): c is Category => typeof c === "string" && VALID_CATEGORIES.includes(c as Category)
        )
      : [];

    const severity = ["low", "medium", "high"].includes(parsed.severity as string)
      ? (parsed.severity as "low" | "medium" | "high")
      : "low";

    return {
      isScam: Boolean(parsed.isScam),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      categories,
      severity,
      reason: String(parsed.reason || ""),
    };
  } catch {
    return null;
  }
}

// Kept for backward compat — wraps analyzeConversation
export async function classifyLine(text: string): Promise<{ category: Category; confidence: number } | null> {
  const result = await analyzeConversation([text]);
  if (!result || result.categories.length === 0) return null;
  return { category: result.categories[0], confidence: result.confidence };
}
