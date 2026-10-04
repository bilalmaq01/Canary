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

function checkHighRisk(
  joinedRecent: string,
  currentLine: string,
  recentLines: string[]
): { clipId: ClipId; category: Category; quotedLine: string } | null {
  // Trigger 1 — gift-card / prepaid card demand
  const hasCardType = containsAny(joinedRecent, [
    "gift card", "gift cards", "itunes", "google play", "amazon gift",
    "steam card", "prepaid card", "vanilla card", "green dot",
  ]);

  const thirdPersonSubjects = ["she ", "he ", "her ", "him "];
  const isThirdPerson = (() => {
    for (let i = recentLines.length - 1; i >= 0; i--) {
      const l = recentLines[i].toLowerCase();
      if (containsAny(l, ["gift card", "itunes", "prepaid"])) {
        const idx = Math.max(l.indexOf("gift card"), l.indexOf("itunes"), l.indexOf("prepaid"));
        const before = l.slice(0, idx);
        return thirdPersonSubjects.some((s) => before.includes(s));
      }
    }
    return false;
  })();

  if (hasCardType && !isThirdPerson) {
    // 1a — code/number demand (read, give me, tell me, etc.)
    if (
      containsAny(joinedRecent, ["read", "give me", "tell me", "provide", "send me", "share", "type"]) &&
      containsAny(joinedRecent, ["code", "codes", "number", "numbers", "back", "pin", "serial", "digit"])
    ) {
      return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
    }
    // 1b — explicit buy/pay demand for gift cards (no code request needed)
    if (
      containsAny(joinedRecent, [
        "buy gift card", "buy itunes", "buy google play", "buy steam", "buy amazon gift",
        "get gift card", "get itunes", "pick up gift card", "go buy gift card",
        "purchase gift card", "pay with gift card", "pay using gift card",
        "pay in gift card", "payment in gift card", "payment with gift card",
        "send gift card", "need gift card",
      ])
    ) {
      return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
    }
  }

  // Trigger 2 — login/verification code demand
  if (
    containsAny(joinedRecent, ["read", "give me", "tell me", "provide"]) &&
    containsAny(joinedRecent, [
      "login code", "verification code", "code we just sent", "code we sent",
      "one-time code", "one time code", "security code", "access code",
      "otp", "two-factor code", "authentication code",
    ])
  ) {
    return { clipId: "warning-login-code", category: "access", quotedLine: currentLine };
  }

  // Trigger 3 — remote access + threat
  if (
    containsAny(joinedRecent, [
      "control of the screen", "control of your screen", "remote access",
      "screen control", "teamviewer", "anydesk", "logmein", "chrome remote",
      "remote desktop", "screen share", "take control",
    ]) &&
    containsAny(joinedRecent, [
      "lock the account", "contact the police", "lock your account",
      "suspend your account", "freeze your account", "arrest", "warrant",
    ])
  ) {
    return { clipId: "warning-remote-access", category: "access", quotedLine: currentLine };
  }

  // Trigger 4 — unambiguous crypto/P2P payment demand
  if (
    containsAny(joinedRecent, [
      "bitcoin atm", "crypto atm", "send bitcoin", "buy bitcoin",
      "send crypto", "send ethereum", "buy ethereum",
      "western union", "moneygram",
      "zelle me", "venmo me", "cash app me",
    ]) &&
    containsAny(joinedRecent, ["need", "must", "have to", "right now", "today", "immediately", "now", "send", "pay"])
  ) {
    return { clipId: "warning-score", category: "payment", quotedLine: currentLine };
  }

  // Trigger 6 — arrest/warrant threat
  if (
    containsAny(joinedRecent, [
      "warrant for your arrest", "arrest warrant", "issued a warrant",
      "police will arrest", "officers will come", "law enforcement will",
    ])
  ) {
    return { clipId: "warning-score", category: "urgency", quotedLine: currentLine };
  }

  // Trigger 7 — SSN/account suspended
  if (
    containsAny(joinedRecent, [
      "social security number has been suspended",
      "social security has been compromised",
      "your account has been suspended due to",
      "flagged for suspicious",
      "flagged for fraud",
    ])
  ) {
    return { clipId: "warning-score", category: "authority", quotedLine: currentLine };
  }

  return null;
}

// ── score path — category checks ─────────────────────────────────────────────

function checkPayment(line: string): boolean {
  if (containsAny(line, ["birthday", "present", "gift for", "anniversary", "holiday gift"])) return false;

  const paymentMethods = [
    // Gift cards
    "gift card", "gift cards", "prepaid card", "itunes", "google play",
    "amazon gift", "steam card", "apple gift", "best buy gift", "target gift",
    "walmart gift", "cvs gift", "vanilla card", "green dot", "moneypak",
    "ebay gift", "nordstrom gift", "sephora gift",
    // Wire / transfer services
    "wire transfer", "wire the money", "wire funds", "western union", "moneygram",
    "money gram", "zelle", "venmo", "cash app", "cashapp", "paypal",
    // Crypto
    "crypto", "bitcoin", "ethereum", "cryptocurrency", "digital currency",
    "bitcoin atm", "crypto atm",
    // Cash / check
    "money order", "cashier's check", "cashier check", "cash withdrawal",
    "withdraw cash", "withdraw the money", "withdraw funds",
    // Bank-direction scam phrases
    "go to your bank", "go to the bank", "head to the bank", "drive to the bank",
    "go to an atm", "go to a bitcoin", "shipping money", "send the money",
    "send cash", "send funds", "send over the money",
    // Overpayment scam
    "send back the difference", "return the overpayment", "refund the excess",
  ];
  const paymentVerbs = [
    "pay", "send", "purchase", "buy", "transfer", "get me", "go get",
    "go buy", "pick up", "obtain", "need you to", "want you to",
    "i need", "you need", "must", "withdraw", "take out", "pull out",
  ];

  // Standalone strong signals that don't need a verb pairing
  const standalone = [
    "go to your bank", "go to the bank", "head to the bank", "drive to the bank",
    "go to an atm", "go to a bitcoin atm", "shipping money",
    "send the money", "send cash", "send back the difference",
  ];
  if (containsAny(line, standalone)) return true;

  return containsAny(line, paymentMethods) && containsAny(line, paymentVerbs);
}

function checkAccess(line: string): boolean {
  if (contains(line, "download this app so we can talk")) return false;
  const accessMethods = [
    "remote access", "screen control", "screen share", "screen sharing",
    "teamviewer", "anydesk", "logmein", "chrome remote", "remote desktop",
    "remote session", "take control", "control of your", "take over your",
    "install", "download",
    "verification code", "login code", "code we", "one-time code", "one time code",
    "security code", "access code", "otp", "passcode", "two-factor", "2fa",
    "authentication code", "pin number", "temporary code", "reset code",
    "account number", "routing number", "social security number",
  ];
  const accessVerbs = [
    "give", "read", "allow", "provide", "install", "download",
    "share", "enter", "type", "tell me", "send me", "confirm",
    "verify", "need your", "require your",
  ];
  return containsAny(line, accessMethods) && containsAny(line, accessVerbs);
}

function checkSecrecy(line: string): boolean {
  const secrecyPhrases = [
    "don't tell", "do not tell", "don't discuss", "do not discuss",
    "keep this between", "don't mention", "do not mention",
    "keep quiet", "stay quiet", "don't share", "do not share",
    "keep this confidential", "confidential matter", "cannot tell",
    "don't let anyone", "do not let anyone", "do not contact",
    "don't contact", "don't call", "do not call your",
    "this is private", "between you and me", "just between us",
    "don't speak to", "do not speak to", "do not inform",
    "hang up if anyone", "step away from",
  ];
  const secrecyTargets = [
    "bank", "family", "anyone", "wife", "husband", "children", "kids",
    "friends", "relatives", "lawyer", "attorney", "accountant",
    "financial advisor", "police", "nobody", "no one", "others",
    "teller", "bank employee", "bank manager", "neighbor", "someone else",
  ];
  return containsAny(line, secrecyPhrases) && containsAny(line, secrecyTargets);
}

function checkAuthority(line: string, previousLine: string | undefined): boolean {
  const demandWords = [
    "must", "need to", "have to", "required", "immediately", "today", "now",
    "right away", "urgent", "time sensitive", "as soon as", "cannot wait",
    "action required", "respond", "contact us",
  ];
  const authorityOrgs = [
    "office", "department", "division", "agency", "bureau",
    "administration", "authority", "commission", "service",
    "irs", "social security", "medicare", "medicaid",
    "fbi", "dea", "ftc", "sec", "treasury", "homeland",
    "attorney general", "prosecutor", "court", "courthouse",
    "sheriff", "detective", "officer", "agent",
    "fraud department", "fraud division", "fraud team", "investigations",
    "bank", "credit union", "financial institution", "visa", "mastercard",
    "amazon", "microsoft", "apple support", "tech support",
  ];
  const authClaims = [
    "this is the", "this is",
    "calling from the", "calling from",
    "i'm calling from", "i am calling from",
    "i'm from the", "i'm from",
    "we're from the", "we're from",
    "on behalf of the", "on behalf of",
    "representing the", "this call is from",
    "you are being contacted by",
    "we've detected", "we detected", "we noticed", "we have identified",
    "our system", "our records", "our department",
  ];

  const lineHasAuth = containsAny(line, authClaims) && containsAny(line, authorityOrgs);
  const prevHasAuth = previousLine !== undefined &&
    containsAny(previousLine, authClaims) && containsAny(previousLine, authorityOrgs);

  if (lineHasAuth) {
    if (containsAny(line, demandWords)) return true;
    if (previousLine !== undefined && containsAny(previousLine, demandWords)) return true;
  }
  if (prevHasAuth && containsAny(line, demandWords)) return true;

  // Standalone fraud-claim patterns — high signal on their own
  const fraudClaims = [
    "fraudulent purchase", "fraudulent transaction", "fraudulent charge",
    "suspicious activity on your", "suspicious transaction",
    "unauthorized transaction", "unauthorized charge", "unauthorized access",
    "your account has been compromised", "your account has been flagged",
    "detected suspicious", "detected fraud", "detected a fraudulent",
    "we have flagged", "flagged your account",
  ];
  if (containsAny(line, fraudClaims)) return true;

  return false;
}

function checkUrgency(line: string): boolean {
  const urgencyTriggers = [
    // Time pressure
    "today", "right now", "immediately", "within the hour", "within 24",
    "expires", "expiring", "deadline", "time is running out",
    // Legal / law enforcement
    "warrant", "arrest", "arrested", "police", "officers", "law enforcement",
    "legal action", "lawsuit", "court", "summons", "charges", "prosecuted",
    "criminal charges", "federal charges", "indictment", "sue you",
    // Account actions
    "freeze", "frozen", "suspend", "suspended", "block", "blocked",
    "close your account", "account will be closed", "shut down your account",
    "your benefits", "benefits will stop", "benefits will be terminated",
    // Consequences
    "lose your job", "lose your pension", "lose your home", "lose your license",
    "lose your benefits", "lose your savings", "lose everything",
    "jail", "prison", "deported", "deportation",
    "fine", "penalty", "penalties",
    // Overdue / final notices
    "final notice", "final warning", "last chance", "last opportunity",
    "overdue", "past due", "delinquent", "default",
    // Compromise claims
    "compromised", "hacked", "stolen", "identity theft",
  ];
  const urgencyConsequences = [
    "must", "have to", "need to", "or", "otherwise", "unless",
    "will be", "going to be", "could be", "may be", "might be",
    "failure to", "if you do not", "if you don't", "we will", "they will",
    "you will", "you could", "you may",
  ];
  return containsAny(line, urgencyTriggers) && containsAny(line, urgencyConsequences);
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
    // 2-category path: payment+secrecy, payment+access, or any two high-value cats
    if (!intervened && score >= 55 && categoriesAwarded.size >= 2) {
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
    if (!intervened && score >= 55 && categoriesAwarded.size >= 2) {
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
