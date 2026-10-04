import type { EmailFlag } from "./types.js";

function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

export function detectEmailScam(
  subject: string,
  bodyText: string
): { flags: EmailFlag[]; score: number } {
  const text = (subject + " " + bodyText).toLowerCase();
  const flags: EmailFlag[] = [];
  let score = 0;

  if (
    containsAny(text, [
      "gift card", "gift cards", "itunes card", "google play card", "wire transfer",
      "wire the money", "western union", "moneygram", "send bitcoin", "send crypto",
      "bitcoin atm", "processing fee", "release fee", "upfront fee", "transfer fee",
      "handling fee", "send money", "money order", "prepaid card",
    ])
  ) {
    flags.push({ type: "payment", detail: "Payment or fee demand detected", severity: "high" });
    score += 30;
  }

  if (
    containsAny(text, [
      "verify your account", "confirm your account", "update your payment",
      "click here to verify", "click here to confirm", "enter your password",
      "confirm your password", "your account has been suspended", "account will be closed",
      "verify your identity", "confirm your identity", "update your information",
      "login to your account", "sign in to verify", "validate your account",
    ])
  ) {
    flags.push({
      type: "phishing",
      detail: "Credential harvesting or account verification demand",
      severity: "high",
    });
    score += 35;
  }

  if (
    containsAny(text, [
      "verification code", "one-time code", "one time code", "otp",
      "two-factor", "2fa code", "security code", "read me the code",
      "enter the code", "provide the code",
    ])
  ) {
    flags.push({
      type: "access",
      detail: "Verification code or credential request",
      severity: "high",
    });
    score += 30;
  }

  if (
    containsAny(text, [
      "act now", "urgent", "immediately", "within 24 hours", "within 48 hours",
      "account suspended", "account will be closed", "expires today", "final notice",
      "last chance", "action required", "response required", "time sensitive",
      "your account will be terminated", "limited time",
    ])
  ) {
    flags.push({ type: "urgency", detail: "Artificial urgency or threat", severity: "medium" });
    score += 15;
  }

  if (
    containsAny(text, [
      "internal revenue service", "irs", "social security administration",
      "social security number", "medicare", "fbi", "federal bureau",
      "department of justice", "u.s. treasury", "customs and border",
      "warrant", "arrest", "lawsuit", "legal action", "court order",
    ])
  ) {
    flags.push({
      type: "authority",
      detail: "Government or law enforcement impersonation",
      severity: "high",
    });
    score += 20;
  }

  if (
    containsAny(text, [
      "do not tell", "do not share", "keep this confidential", "between us",
      "private matter", "don't tell your bank", "do not contact your bank",
      "do not discuss",
    ])
  ) {
    flags.push({
      type: "secrecy",
      detail: "Secrecy demand — hiding from family or bank",
      severity: "medium",
    });
    score += 10;
  }

  if (
    containsAny(text, [
      "i love you", "i miss you", "my love", "my darling", "i need your help",
      "i am stuck", "i am in trouble", "stranded", "stuck abroad", "stuck in",
      "emergency situation", "i need money", "please send", "can you help me",
      "i will pay you back",
    ])
  ) {
    flags.push({
      type: "romance",
      detail: "Romance or emergency manipulation pattern",
      severity: "medium",
    });
    score += 25;
  }

  return { flags, score: Math.min(score, 100) };
}
