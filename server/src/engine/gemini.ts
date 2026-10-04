import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Category, ClipId } from "../events.js";

export interface GeminiAnalysis {
  isScam: boolean;
  confidence: number;
  categories: Category[];
  severity: "low" | "medium" | "high";
  reason: string;
  quotedLine: string;
}

let _model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]> | null = null;
function getModel() {
  if (!_model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    _model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
  }
  return _model;
}

export function clipForCategories(categories: Category[], severity: "low" | "medium" | "high"): ClipId {
  if (categories.includes("access")) return "warning-login-code";
  if (categories.includes("payment")) {
    return severity === "high" ? "warning-gift-card" : "warning-score";
  }
  return "warning-score";
}

const VALID_CATEGORIES: Category[] = ["payment", "access", "secrecy", "authority", "urgency"];

const SYSTEM_PROMPT = `You are Canary AI, a real-time fraud detection system protecting elderly and vulnerable people from phone scams.

SCAM PATTERNS TO DETECT:
• Government impersonation — IRS, SSA, Medicare, FBI, DEA, sheriff, police; threatens arrest or demands immediate payment
• Gift card demands — buy iTunes, Google Play, Amazon, Walmart, Target, CVS, Steam gift cards and read back the numbers/codes
• Remote access — install TeamViewer/AnyDesk, share screen, give control of computer
• Code/credential demands — read a login code, OTP, verification code, password, PIN, account number, card number, recovery phrase
• Secrecy demands — do not tell family, bank, lawyer, or anyone about this call or payment
• Wire/crypto — wire money, send Bitcoin/Ethereum/USDT, use Western Union, MoneyGram, Zelle, Cash App, Venmo
• Fake emergencies — account suspended, warrant issued, SSN compromised, money being stolen right now
• Advance fees — upfront fee required to release winnings, loan, grant, or inheritance
• Impersonation — poses as family member in trouble, boss needing gift cards, or romance partner

DO NOT flag:
• Legitimate appointment/prescription/billing reminders that ask nothing of the listener
• Mentions of past scams, codes, or gift cards in a clearly past-tense or third-person context
• Requests to call back a number with no payment demand
• Normal bank alerts that explicitly say they will NOT ask for codes

CATEGORIES (return only clearly applicable ones):
- "payment": Gift cards, wire, crypto, money orders, prepaid cards, cash handoff, any unusual payment
- "access": Remote desktop, login codes, OTPs, verification codes, passwords, card/account numbers, recovery phrases
- "secrecy": Hide the call or payment from family, banks, lawyers, or anyone
- "authority": False claim of government agency, law enforcement, bank fraud dept, or official institution
- "urgency": Threats of arrest/lawsuit/account closure, artificial deadlines, consequences for not acting now`;

function buildPrompt(lines: string[], engineContext?: { score: number; categories: Category[] }): string {
  const transcript = lines.map((l, i) => `[${i + 1}] "${l}"`).join("\n");

  const contextBlock = engineContext && (engineContext.score > 0 || engineContext.categories.length > 0)
    ? `\nRULES ENGINE STATE: score=${engineContext.score}, categories already detected=[${engineContext.categories.join(", ")}]\n`
    : "";

  return `${SYSTEM_PROMPT}
${contextBlock}
TRANSCRIPT OF MOST RECENT CALLER LINES:
${transcript}

Evaluate whether this is a scam based solely on what the caller said.

Return ONLY valid JSON — no markdown, no extra text:
{
  "isScam": true or false,
  "confidence": number 0.0–1.0,
  "categories": ["payment" | "access" | "secrecy" | "authority" | "urgency"],
  "severity": "low" | "medium" | "high",
  "reason": "one sentence under 15 words",
  "quotedLine": "verbatim copy of the single most suspicious line from the transcript, or empty string"
}

CONFIDENCE GUIDE:
- 0.90+: Multiple unmistakable scam signals (gift card codes demanded, arrest threatened)
- 0.70–0.89: Strong scam pattern, very likely a scam
- 0.50–0.69: Suspicious but could be legitimate
- below 0.50: Insufficient evidence, probably benign

SEVERITY:
- "high": Gift card codes/crypto demanded right now, arrest/deportation threatened, active remote access
- "medium": Clear scam building — payment method named + authority claim or secrecy demand
- "low": Early signals only — authority claim or urgency without a clear demand`;
}

export async function analyzeConversation(
  lines: string[],
  engineContext?: { score: number; categories: Category[] }
): Promise<GeminiAnalysis | null> {
  if (!process.env.GEMINI_API_KEY || lines.length === 0) return null;

  const prompt = buildPrompt(lines, engineContext);

  try {
    const result = await Promise.race([
      getModel().generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 6000)
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
      quotedLine: String(parsed.quotedLine || ""),
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
