import type { Category } from "../events.js";

const GEMINI_TIMEOUT_MS = 3000;

const SYSTEM_PROMPT = `You are a scam-call detection classifier. Given a single utterance from a caller, classify it into exactly one of the following categories, or null if the line is benign.

Categories:
- payment: demanding gift cards, wire transfer, crypto, or other non-reversible payment
- access: asking to read a login/verification code aloud, or asking to install/allow remote access
- secrecy: asking the victim to hide this from their bank, family, or anyone
- authority: claiming to be from a government office, law enforcement, or official agency AND making a demand
- urgency: threatening immediate consequences (arrest, account lock, legal action) unless action is taken now

Respond ONLY with a JSON object in this exact format, with no markdown fences or extra text:
{"category": "<name>" | null, "confidence": 0.0}

If the line is benign, respond with: {"category": null, "confidence": 0.0}
Only classify as a category if you are highly confident (confidence >= 0.85).`;

export interface GeminiResult {
  category: Category;
  confidence: number;
}

export async function classifyLine(text: string): Promise<GeminiResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), GEMINI_TIMEOUT_MS)
  );

  const classifyPromise = (async (): Promise<GeminiResult | null> => {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nCaller line: ${JSON.stringify(text)}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.response.text().trim();
      let parsed: { category: string | null; confidence: number };

      try {
        parsed = JSON.parse(responseText);
      } catch {
        return null;
      }

      if (
        parsed.category === null ||
        typeof parsed.category !== "string" ||
        typeof parsed.confidence !== "number"
      ) {
        return null;
      }

      const validCategories: Category[] = ["payment", "access", "secrecy", "authority", "urgency"];
      if (!validCategories.includes(parsed.category as Category)) {
        return null;
      }

      return {
        category: parsed.category as Category,
        confidence: parsed.confidence,
      };
    } catch {
      return null;
    }
  })();

  return Promise.race([classifyPromise, timeoutPromise]);
}
