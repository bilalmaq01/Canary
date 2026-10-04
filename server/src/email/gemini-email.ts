import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeminiEmailAnalysis {
  isScam: boolean;
  confidence: number;
  scamType: string;
  reason: string;
  quotedText: string;
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

export async function analyzeEmail(
  subject: string,
  bodyText: string,
  fromDomain: string,
  knownBrand: string | null
): Promise<GeminiEmailAnalysis | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const body = bodyText.slice(0, 2000);
  const brandNote = knownBrand
    ? `\nNOTE: The sender claims to be "${knownBrand}" but is sending from domain "${fromDomain}".`
    : "";
  const prompt = `You are Canary AI, an email scam detector protecting vulnerable people.${brandNote}

EMAIL:
Subject: ${subject}
Body: ${body}

Scam types: phishing, advance_fee, romance, invoice_fraud, government_impersonation, tech_support, package_scam, gift_card, domain_spoofing, other, none

Return ONLY valid JSON:
{
  "isScam": true or false,
  "confidence": 0.0-1.0,
  "scamType": "...",
  "reason": "one sentence under 15 words",
  "quotedText": "most suspicious verbatim phrase from the email, or empty string"
}`;

  try {
    const result = await Promise.race([
      getModel().generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000)
      ),
    ]);
    const raw = result.response.text().trim();
    const jsonStr = raw.startsWith("{") ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? "");
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      isScam: Boolean(parsed.isScam),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      scamType: String(parsed.scamType || "other"),
      reason: String(parsed.reason || ""),
      quotedText: String(parsed.quotedText || ""),
    };
  } catch {
    return null;
  }
}
