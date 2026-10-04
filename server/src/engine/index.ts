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

// Word-boundary match — prevents short needles from matching inside larger words
// (e.g. "now" must not match inside "know", "or" must not match inside "order").
function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

function containsAnyWord(haystack: string, needles: string[]): boolean {
  return needles.some((n) => containsWord(haystack, n));
}

// Benign gift-card context — a gift-giving occasion, or the speaker expressing
// their own wish ("I'm hoping to get some gift cards") rather than directing the
// listener to go buy and hand them over. A scammer demands; a relative asks.
// NOTE: this never exempts a request to READ codes/numbers off a card, which is
// the one gift-card signal that is never legitimate.
const GIFT_OCCASION = [
  "birthday", "present", "gift for", "anniversary", "holiday gift",
  "christmas", "graduation", "wedding",
];
const FIRST_PERSON_WISH = [
  "i'm hoping", "i am hoping", "i was hoping", "i'd like", "i would like",
  "i'd love", "i would love", "can i get", "could i get",
];
function isBenignGiftContext(text: string): boolean {
  return containsAny(text, GIFT_OCCASION) || containsAny(text, FIRST_PERSON_WISH);
}

// Meta / educational / negation context — the caller is discussing scams in the
// abstract or warning against them ("scammers often ask you to read gift card
// codes", "we'll never ask for your password"), not making a live demand.
const META_CUES = [
  "scammer", "scammers", "is a scam", "a common scam", "fraud awareness",
  "awareness class", "awareness session", "warn you about", "warns against",
  "warning you about", "never give out", "never share your", "never read out",
  "never tell anyone", "we'll never ask", "we will never ask", "is a secret",
  "keep your password", "keep your passwords", "report suspicious", "phishing",
];
function isMetaContext(text: string): boolean {
  return containsAny(text, META_CUES);
}

// Brand-agnostic stored-value instrument: a gift/prepaid card, or any branded
// card/voucher. Deliberately excludes a bare "card" — a credit/debit card is not
// a stored-value instrument ("the number on the back of your card" is benign).
const STORED_VALUE_RE =
  /\b(gift|prepaid|apple|itunes|google play|google|steam|amazon|xbox|playstation|nintendo|visa|mastercard|vanilla|green dot|moneypak|target|walmart|best buy|ebay|razer|sephora|nordstrom|netflix)\s+(cards?|vouchers?)\b/;
function hasStoredValueCard(text: string): boolean {
  return (
    STORED_VALUE_RE.test(text) ||
    /\bgift\s+cards?\b/.test(text) ||
    /\bprepaid\s+(cards?|vouchers?)\b/.test(text)
  );
}

// Handing a secret token to the caller — a listener-directed verb plus a token.
// Reading codes/PINs/digits off to a caller is never legitimate.
const HANDOVER_VERBS = [
  "read me", "read back", "read out", "read it back", "read the", "give me",
  "tell me", "send me", "send over", "text me", "ping me", "share the",
  "share your", "provide the", "provide your", "type the", "enter the",
  "confirm the", "confirm your", "spell out", "what's the", "what is the",
];
const STRONG_TOKENS = [
  "code", "codes", "pin", "digit", "digits", "passcode", "otp",
  "one time code", "one-time code", "verification code", "security code",
  "authentication code", "two-factor", "login code", "recovery phrase",
  "seed phrase", "redemption", "last four", "last 4", "password", "bank login",
];
function hasCodeExtraction(text: string): boolean {
  if (containsAny(text, HANDOVER_VERBS) && containsAnyWord(text, STRONG_TOKENS)) return true;
  // "number(s)"/"serial" only count as a secret in a stored-value-card context.
  if (
    hasStoredValueCard(text) &&
    containsAny(text, HANDOVER_VERBS) &&
    containsAnyWord(text, ["number", "numbers", "serial"])
  ) {
    return true;
  }
  return false;
}

// ── high-risk path ────────────────────────────────────────────────────────────

function checkHighRisk(
  joinedRecent: string,
  currentLine: string,
  recentLines: string[]
): { clipId: ClipId; category: Category; quotedLine: string } | null {
  // Educational / meta / negation discussion is not a live demand.
  if (isMetaContext(joinedRecent)) return null;

  // Trigger 1 — gift-card / prepaid card demand
  const hasCardType = containsAny(joinedRecent, [
    "gift card", "gift cards", "itunes", "google play", "amazon gift",
    "steam card", "prepaid card", "vanilla card", "green dot",
  ]);

  // Use space-padded subjects to avoid matching "he" inside "the", "they", "their", etc.
  const thirdPersonSubjects = [" she ", " he ", " her ", " him "];
  const isThirdPerson = (() => {
    for (let i = recentLines.length - 1; i >= 0; i--) {
      const l = recentLines[i].toLowerCase();
      if (containsAny(l, ["gift card", "itunes", "prepaid"])) {
        const idx = Math.max(l.indexOf("gift card"), l.indexOf("itunes"), l.indexOf("prepaid"));
        const before = " " + l.slice(0, idx); // prepend space for start-of-string word boundary
        return thirdPersonSubjects.some((s) => before.includes(s));
      }
    }
    return false;
  })();

  if (hasCardType && !isThirdPerson) {
    // 1a — code/number demand (broad verb list). Reading the codes/numbers off a
    // card is never legitimate, so this fires even in a gift-giving context.
    if (
      containsAny(joinedRecent, ["read", "give me", "tell me", "provide", "send me", "send", "share", "type", "scratch", "text me", "read back"]) &&
      containsAny(joinedRecent, ["code", "codes", "number", "numbers", "back", "pin", "serial", "digit"])
    ) {
      return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
    }

    // 1b/1c only fire as a *demand to buy* — suppressed when the gift cards are
    // framed as a gift or the speaker's own wish (e.g. "it's my birthday, I'm
    // hoping to get some gift cards").
    if (!isBenignGiftContext(joinedRecent)) {
      // 1b — explicit buy/pay demand for gift cards
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
      // 1c — any payment action + gift card type (catches "buy a few gift cards", "pay [amount] with gift cards")
      if (containsAny(joinedRecent, ["buy", "pay", "get", "pick up", "purchase", "send", "need", "want"])) {
        return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
      }
    }
  }

  // Trigger 2 — login/verification code demand
  if (
    containsAny(joinedRecent, ["read", "give me", "tell me", "provide", "enter", "send me"]) &&
    containsAny(joinedRecent, [
      "login code", "verification code", "code we just sent", "code we sent",
      "one-time code", "one time code", "security code", "access code",
      "otp", "two-factor code", "authentication code",
      "code we",
      "digit code",
      "card number", "full card number", "expiration date", "cvv", "digits on the back",
      "recovery phrase", "seed phrase", "twelve-word", "twenty-four word",
      "your login", "account login", "bank login",
      "router password", "wifi password", "wi-fi password",
      "mother's maiden", "maiden name",
      "read it back", "read it to me",
    ])
  ) {
    return { clipId: "warning-login-code", category: "access", quotedLine: currentLine };
  }

  // Trigger 5 — ransom / extortion demand
  if (
    containsAny(joinedRecent, [
      "you will never see her", "you will never see him", "you will never see them",
      "you will never see your", "never see them again", "never see her again", "never see him again",
    ])
  ) {
    return { clipId: "warning-score", category: "urgency", quotedLine: currentLine };
  }

  // Trigger 3 — remote access + threat
  if (
    containsAny(joinedRecent, [
      "control of the screen", "control of your screen", "remote access",
      "screen control", "teamviewer", "anydesk", "logmein", "chrome remote",
      "remote desktop", "screen share", "take control", "see your screen",
      "view your screen", "access your computer", "access your device",
    ]) &&
    containsAny(joinedRecent, [
      "lock the account", "contact the police", "lock your account",
      "suspend your account", "freeze your account", "arrest", "warrant",
      "files will be deleted", "delete your files", "wipe your", "will be encrypted",
      "will lock", "going to lock", "charge goes through", "charge will go through",
      "or the charge",
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
      "warrant for your arrest", "arrest warrant", "issued a warrant", "bench warrant",
      "police will arrest", "officers will come", "law enforcement will",
      "send a unit", "send officers", "send a deputy", "send the police", "send a squad",
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

  // ── Compositional generalization (brand- and verb-agnostic) ──────────────────
  // Catches real-world paraphrases the literal lists above miss: "apple cards",
  // "steam vouchers", "ping me the digits", "send over the passcode", etc.
  if (!isThirdPerson) {
    // Handing any secret token to the caller is never legitimate — fires even in
    // a gift context (reading codes off a birthday card is still theft).
    if (hasCodeExtraction(joinedRecent)) {
      const card = hasStoredValueCard(joinedRecent);
      return {
        clipId: card ? "warning-gift-card" : "warning-login-code",
        category: card ? "payment" : "access",
        quotedLine: currentLine,
      };
    }

    // A stored-value card framed as a payment demand (not a gift or a wish).
    if (
      hasStoredValueCard(joinedRecent) &&
      !isBenignGiftContext(joinedRecent) &&
      containsAny(joinedRecent, [
        "buy", "pay", "get", "pick up", "purchase", "send", "need", "want",
        "load", "put money on", "grab", "go get", "go buy",
      ])
    ) {
      return { clipId: "warning-gift-card", category: "payment", quotedLine: currentLine };
    }

    // "Safe account" bank-impersonation: move funds to an account the caller
    // controls. No legitimate caller ever directs this.
    if (
      containsAny(joinedRecent, ["safe account", "secure account", "protected account", "safety account"]) &&
      containsAny(joinedRecent, ["move", "transfer", "wire", "send", "put", "deposit", "shift"])
    ) {
      return { clipId: "warning-score", category: "payment", quotedLine: currentLine };
    }

    // Remote-access takeover paired with a threat/consequence.
    if (
      containsAny(joinedRecent, [
        "take over your screen", "take over the screen", "remote in",
        "let me in to your", "get into your computer", "into your device",
        "connect to your computer", "take over your computer",
      ]) &&
      containsAny(joinedRecent, [
        "lose your files", "lose everything", "delete your files", "wipe",
        "will be encrypted", "or you lose", "or the charge", "or we", "unless you",
      ])
    ) {
      return { clipId: "warning-remote-access", category: "access", quotedLine: currentLine };
    }
  }

  return null;
}

// ── score path — category checks ─────────────────────────────────────────────

function checkPayment(line: string): boolean {
  if (isBenignGiftContext(line) || isMetaContext(line)) return false;

  const paymentMethods = [
    // Gift cards
    "gift card", "gift cards", "prepaid card", "itunes", "google play",
    "amazon gift", "steam card", "apple gift", "best buy gift", "target gift",
    "walmart gift", "cvs gift", "vanilla card", "green dot", "moneypak",
    "ebay gift", "nordstrom gift", "sephora gift",
    // Wire / transfer services
    "wire transfer", "wire the money", "wire funds", "western union", "moneygram",
    "money gram", "money transfer", "by wire", "zelle", "venmo", "cash app", "cashapp", "paypal",
    // Crypto
    "crypto", "bitcoin", "ethereum", "cryptocurrency", "digital currency",
    "bitcoin atm", "crypto atm", "bitcoin machine", "usdt", "tether", "stablecoin",
    // Payment demand words (fee types that are always paired with a payment verb)
    "taxes", "invoice payment",
    // Cash / check
    "money order", "cashier's check", "cashier check", "cash withdrawal",
    "withdraw cash", "withdraw the money", "withdraw funds",
    // Precious metals (scam courier payment)
    "gold bar", "gold bars", "gold coins",
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
    "deposit", "wire", "hand", "convert",
  ];

  // Standalone strong signals that don't need a verb pairing
  const standalone = [
    "go to your bank", "go to the bank", "head to the bank", "drive to the bank",
    "go to an atm", "go to a bitcoin atm", "shipping money",
    "send the money", "send cash", "send back the difference",
    // Wire/transfer demand phrases
    "wire it", "wire me", "wire us", "wire him", "wire her",
    "wire the money", "wire the funds",
    // Move/transfer savings/funds
    "move your savings", "move your money", "move the money", "move your funds",
    "transfer your funds", "transfer your savings", "transfer the funds", "transfer your money",
    // Cash handoff
    "hand it to", "hand over the cash", "hand me the cash", "hand the cash", "hand my agent",
    "pick up the cash", "send the cash",
    // Payment demands
    "send the payment", "send a payment",
    // Bitcoin deposit
    "deposit into the bitcoin", "deposit it into", "deposit in the bitcoin",
    // Cash withdrawal
    "withdraw your cash", "withdraw the cash",
    // Wire variants
    "pay by wire", "by wire",
    // Cash in-person handoff
    "card deposit",
    // Fee payment phrases
    "for taxes",
  ];
  if (containsAny(line, standalone)) return true;

  return containsAny(line, paymentMethods) && containsAny(line, paymentVerbs);
}

function checkAccess(line: string): boolean {
  if (contains(line, "download this app so we can talk")) return false;
  if (isMetaContext(line)) return false;
  const accessMethods = [
    "remote access", "screen control", "screen share", "screen sharing",
    "teamviewer", "anydesk", "logmein", "chrome remote", "remote desktop",
    "remote session", "take control", "control of your", "take over your",
    "install", "download",
    "verification code", "login code", "code we", "one-time code", "one time code",
    "security code", "access code", "otp", "passcode", "two-factor", "2fa",
    "authentication code", "pin number", "temporary code", "reset code",
    "account number", "routing number", "social security number",
    // Device/network credentials
    "router password", "wi-fi password", "wifi password", "network password",
    // Banking credentials
    "bank login", "bank details", "bank information", "online banking",
    "banking password", "your login",
    // Card details
    "card number", "full card number", "expiration date", "cvv",
    "digits on the back", "three digits", "four digits", "security code on",
    // Crypto wallet
    "recovery phrase", "seed phrase", "twelve-word", "twenty-four word",
    "wallet phrase", "private key",
    // Identity
    "mother's maiden", "maiden name",
  ];
  const accessVerbs = [
    "give", "read", "allow", "provide", "install", "download",
    "share", "enter", "type", "tell me", "send me", "confirm",
    "verify", "need your", "require your", "i need",
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
    "keep it between", "keep it private", "tell no one",
  ];
  const secrecyTargets = [
    "bank", "family", "anyone", "wife", "husband", "children", "kids",
    "friends", "relatives", "lawyer", "attorney", "accountant",
    "financial advisor", "police", "nobody", "no one", "others",
    "teller", "bank employee", "bank manager", "neighbor", "someone else",
    "us", "mom", "dad", "mother", "father", "parent", "parents",
    "clerk", "servicer", "branch", "anyone else", "everyone else",
    "advisor", "advisor", "spouse", "partner",
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
    "fraud department", "fraud division", "fraud team", "fraud unit", "investigations",
    "bank", "credit union", "financial institution", "visa", "mastercard",
    "amazon", "microsoft", "apple support", "tech support",
    "customs", "border protection", "immigration", "billing", "carrier",
    "enforcement", "patrol", "inspector",
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
    if (containsAnyWord(line, demandWords)) return true;
    if (previousLine !== undefined && containsAnyWord(previousLine, demandWords)) return true;
  }
  if (prevHasAuth && containsAnyWord(line, demandWords)) return true;

  // Government / law-enforcement impersonation fires on the claim alone — no
  // demand word required. A legitimate caller almost never opens with "this is
  // the IRS / FBI / Social Security Administration". Word-boundary matched so
  // "irs" does not match "first", "sec" does not match "security", etc.
  const govEnforcementOrgs = [
    "irs", "fbi", "dea", "ftc", "sec", "cia",
    "social security", "medicare", "medicaid",
    "homeland security", "customs", "border protection", "immigration",
    "attorney general", "treasury department", "u.s. treasury",
    "marshal", "interpol", "sheriff", "state police", "police department",
  ];
  const govClaim = containsAny(line, authClaims) && containsAnyWord(line, govEnforcementOrgs);
  const prevGovClaim = previousLine !== undefined &&
    containsAny(previousLine, authClaims) && containsAnyWord(previousLine, govEnforcementOrgs);
  if (govClaim || prevGovClaim) return true;

  // Tech-support impersonation: an authority/tech-company claim paired with a
  // device-problem claim (often split across two lines in a live transcript).
  const deviceProblemClaims = [
    "virus on your computer", "virus on your", "computer has a virus",
    "your computer is infected", "computer is infected", "device is infected",
    "malware on your", "infected with a virus", "has been hacked",
  ];
  if (containsAny(line, deviceProblemClaims) && (lineHasAuth || prevHasAuth)) return true;

  // Standalone fraud-claim patterns — high signal on their own
  const fraudClaims = [
    "fraudulent purchase", "fraudulent transaction", "fraudulent charge",
    "suspicious activity on your", "suspicious transaction",
    "unauthorized transaction", "unauthorized charge", "unauthorized access",
    "your account has been compromised", "your account has been flagged",
    "detected suspicious", "detected fraud", "detected a fraudulent",
    "we have flagged", "flagged your account",
    "someone is draining", "being drained", "your funds are being",
    "hackers are targeting", "detected hackers", "hackers on your",
    "your accounts are compromised", "accounts have been compromised",
    "account is being accessed", "unauthorized login",
    "fraud case", "fraud investigation",
  ];
  if (containsAny(line, fraudClaims)) return true;

  return false;
}

function checkUrgency(line: string): boolean {
  const urgencyTriggers = [
    // Time pressure
    "today", "right now", "immediately", "now", "within the hour", "within 24",
    "expires", "expiring", "deadline", "time is running out",
    "within two hours", "within an hour", "within one hour", "within the next hour",
    "twenty-four hours", "twenty four hours",
    "in two hours", "in one hour", "by end of day", "end of business",
    // Legal / law enforcement
    "warrant", "arrest", "arrested", "police", "officers", "law enforcement",
    "legal action", "lawsuit", "court", "summons", "charges", "prosecuted",
    "criminal charges", "federal charges", "indictment", "sue you",
    "deputies will come", "officers will come to", "come to your home", "come to your door",
    "sheriff will", "agent will come", "law enforcement will visit",
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
    "hacker", "hackers", "being hacked", "being compromised",
  ];
  const urgencyConsequences = [
    "must", "have to", "need to", "or", "otherwise", "unless",
    "will be", "going to be", "could be", "may be", "might be",
    "failure to", "if you do not", "if you don't", "we will", "they will",
    "you will", "you could", "you may",
    "we need", "to keep", "to avoid", "to prevent",
  ];
  // Self-contained threats / deadlines — the phrase is the urgency, no separate
  // consequence connector needed (e.g. "deputies will come to your home").
  const standaloneUrgency = [
    "within two hours", "within an hour", "within one hour", "within the hour",
    "within 24 hours", "within twenty-four hours", "twenty-four hours", "twenty four hours",
    "come to your home", "come to your door", "come to your house",
    "deputies will come", "officers will come", "police will come", "sheriff will come",
    "warrant for your arrest", "arrest warrant", "you will be arrested",
    "final notice", "final warning", "last chance", "last warning",
  ];
  if (containsAny(line, standaloneUrgency)) return true;

  return containsAnyWord(line, urgencyTriggers) && containsAnyWord(line, urgencyConsequences);
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
      { cat: "urgency", fired: checkUrgency(joinedRecent) },
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
    // 2-category path: any two categories at 45+ points
    if (!intervened && score >= 45 && categoriesAwarded.size >= 2) {
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
    if (!intervened && score >= 45 && categoriesAwarded.size >= 2) {
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
