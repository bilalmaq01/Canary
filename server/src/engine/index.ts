import { Category, ClipId, Evidence, TriggerPath, CATEGORY_POINTS } from "../events.js";

export interface EngineResult {
  score: number;
  categoriesAwarded: Category[];
  triggered: boolean;
  triggerPath?: TriggerPath;
  clipId?: ClipId;
  evidence?: Evidence;
}

export interface Engine {
  processLine(text: string, isFinal: boolean): EngineResult;
  addGeminiEvidence(category: Category): EngineResult;
  getState(): EngineResult;
  reset(): void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function contains(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

// ── high-risk path ────────────────────────────────────────────────────────────

/**
 * Returns { clipId, category, quotedLine } if any high-risk pattern fires,
 * or null otherwise.
 *
 * recentLines: the raw (un-lowercased) sliding window of recent lines.
 */
function checkHighRisk(
  joinedRecent: string,
  currentLine: string,
  recentLines: string[]
): { clipId: ClipId; category: Category; quotedLine: string } | null {
  // Trigger 1 — gift-card demand
  if (
    contains(joinedRecent, "gift card") &&
    contains(joinedRecent, "read") &&
    containsAny(joinedRecent, ["codes", "code"])
  ) {
    // Past-tense recounting check: skip if the line that contains "gift card"
    // has a third-person subject (she/he/her/him) appearing before "gift card".
    // Find which line in the window contains "gift card".
    const thirdPersonSubjects = ["she ", "he ", "her ", "him "];
    let gcLine: string | undefined;
    for (let i = recentLines.length - 1; i >= 0; i--) {
      if (recentLines[i].toLowerCase().includes("gift card")) {
        gcLine = recentLines[i].toLowerCase();
        break;
      }
    }
    if (gcLine !== undefined) {
      const gcIdx = gcLine.indexOf("gift card");
      const beforeGc = gcLine.slice(0, gcIdx);
      if (thirdPersonSubjects.some((s) => beforeGc.includes(s))) {
        // Skip — this is a past-tense recounting
      } else {
        return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
      }
    } else {
      // "gift card" found in joinedRecent but not in any individual line
      // (shouldn't happen, but treat as non-recounting)
      return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
    }
  }

  // Trigger 2 — login/verification code demand
  if (
    contains(joinedRecent, "read") &&
    containsAny(joinedRecent, [
      "login code",
      "verification code",
      "code we just sent",
      "code we sent",
    ])
  ) {
    return { clipId: "warning-login-code", category: "access", quotedLine: currentLine };
  }

  // Trigger 3 — remote access + threat
  if (
    containsAny(joinedRecent, [
      "control of the screen",
      "control of your screen",
      "remote access",
      "screen control",
    ]) &&
    containsAny(joinedRecent, [
      "lock the account",
      "contact the police",
      "lock your account",
    ])
  ) {
    return { clipId: "warning-remote-access", category: "access", quotedLine: currentLine };
  }

  return null;
}

// ── score path — category checks ─────────────────────────────────────────────

function checkPayment(line: string): boolean {
  // Exception: birthday / present / gift-for context
  if (containsAny(line, ["birthday", "present", "gift for"])) return false;
  return (
    containsAny(line, ["gift card", "wire transfer", "wire", "crypto", "bitcoin", "zelle"]) &&
    containsAny(line, ["pay", "send", "purchase", "buy", "transfer"])
  );
}

function checkAccess(line: string): boolean {
  // Exception: download-app-without-threat pattern
  if (contains(line, "download this app so we can talk")) return false;
  return (
    containsAny(line, [
      "remote access",
      "screen control",
      "install",
      "download",
      "verification code",
      "login code",
      "code we",
    ]) &&
    containsAny(line, ["give", "read", "allow", "provide", "install", "download"])
  );
}

function checkSecrecy(line: string): boolean {
  return (
    containsAny(line, [
      "don't tell",
      "do not tell",
      "don't discuss",
      "do not discuss",
      "keep this between",
      "don't mention",
    ]) &&
    containsAny(line, ["bank", "family", "anyone", "wife", "husband", "children", "kids"])
  );
}

function checkAuthority(line: string, previousLine: string | undefined): boolean {
  const demandWords = ["must", "need to", "have to", "required", "immediately", "today", "now"];
  const authorityOrgs = ["office", "department", "division", "agency"];
  const authClaims = ["this is the", "this is"];

  // Case 1: authority claim in this line + demand in this or previous line
  if (containsAny(line, authClaims) && containsAny(line, authorityOrgs)) {
    if (containsAny(line, demandWords)) return true;
    if (previousLine !== undefined && containsAny(previousLine, demandWords)) return true;
  }

  // Case 2: authority claim in previous line + demand in this line
  if (
    previousLine !== undefined &&
    containsAny(previousLine, authClaims) &&
    containsAny(previousLine, authorityOrgs) &&
    containsAny(line, demandWords)
  ) {
    return true;
  }

  return false;
}

function checkUrgency(line: string): boolean {
  return (
    containsAny(line, [
      "today",
      "right now",
      "immediately",
      "within the hour",
      "expires",
      "warrant",
      "arrest",
      "police",
    ]) &&
    containsAny(line, ["must", "have to", "need to", "or", "otherwise", "unless"])
  );
}

// ── engine factory ────────────────────────────────────────────────────────────

export function createEngine(): Engine {
  let score = 0;
  let categoriesAwarded: Set<Category> = new Set();
  let recentLines: string[] = [];
  let intervened = false;
  let lastResult: EngineResult = {
    score: 0,
    categoriesAwarded: [],
    triggered: false,
  };

  function snapshot(): EngineResult {
    return { ...lastResult };
  }

  function buildResult(): EngineResult {
    lastResult = {
      score,
      categoriesAwarded: Array.from(categoriesAwarded),
      triggered: intervened,
      triggerPath: lastResult.triggerPath,
      clipId: lastResult.clipId,
      evidence: lastResult.evidence,
    };
    return snapshot();
  }

  function processLine(text: string, isFinal: boolean): EngineResult {
    // Interim lines never update state
    if (!isFinal) return snapshot();

    // Add to sliding window (last 6 final lines)
    recentLines.push(text);
    if (recentLines.length > 6) recentLines.shift();

    const joinedRecent = recentLines.map((l) => l.toLowerCase()).join(" ");
    const lineLower = text.toLowerCase();
    const previousLine =
      recentLines.length >= 2
        ? recentLines[recentLines.length - 2].toLowerCase()
        : undefined;

    // ── Score path always runs (accumulates even after intervention) ────────
    const checks: { cat: Category; fired: boolean }[] = [
      { cat: "payment", fired: checkPayment(lineLower) },
      { cat: "access", fired: checkAccess(lineLower) },
      { cat: "secrecy", fired: checkSecrecy(lineLower) },
      { cat: "authority", fired: checkAuthority(lineLower, previousLine) },
      { cat: "urgency", fired: checkUrgency(lineLower) },
    ];

    for (const { cat, fired } of checks) {
      if (fired && !categoriesAwarded.has(cat)) {
        categoriesAwarded.add(cat);
        score += CATEGORY_POINTS[cat];
      }
    }

    // ── High-risk path (triggers once) ─────────────────────────────────────
    if (!intervened) {
      const highRisk = checkHighRisk(joinedRecent, text, recentLines);
      if (highRisk) {
        intervened = true;
        lastResult = {
          score,
          categoriesAwarded: Array.from(categoriesAwarded),
          triggered: true,
          triggerPath: "high_risk",
          clipId: highRisk.clipId,
          evidence: {
            triggerPath: "high_risk",
            category: highRisk.category,
            quotedLine: highRisk.quotedLine,
          },
        };
        return snapshot();
      }
    }

    // ── Score path trigger (triggers once) ─────────────────────────────────
    if (!intervened && score >= 70 && categoriesAwarded.size >= 3) {
      intervened = true;
      lastResult = {
        score,
        categoriesAwarded: Array.from(categoriesAwarded),
        triggered: true,
        triggerPath: "score",
        clipId: "warning-score",
        evidence: {
          triggerPath: "score",
          quotedLine: text,
        },
      };
      return snapshot();
    }

    return buildResult();
  }

  function addGeminiEvidence(category: Category): EngineResult {
    // If already awarded, nothing to do
    if (categoriesAwarded.has(category)) return buildResult();

    categoriesAwarded.add(category);
    score += CATEGORY_POINTS[category];

    // Fire score-path trigger if threshold met and not yet intervened
    if (!intervened && score >= 70 && categoriesAwarded.size >= 3) {
      intervened = true;
      lastResult = {
        score,
        categoriesAwarded: Array.from(categoriesAwarded),
        triggered: true,
        triggerPath: "score",
        clipId: "warning-score",
        evidence: {
          triggerPath: "score",
          quotedLine: "(Gemini paraphrase detection)",
        },
      };
      return snapshot();
    }

    return buildResult();
  }

  function getState(): EngineResult {
    return snapshot();
  }

  function reset(): void {
    score = 0;
    categoriesAwarded = new Set();
    recentLines = [];
    intervened = false;
    lastResult = {
      score: 0,
      categoriesAwarded: [],
      triggered: false,
    };
  }

  return { processLine, addGeminiEvidence, getState, reset };
}
