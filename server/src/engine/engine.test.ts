import { describe, it, expect, beforeEach } from "vitest";
import { createEngine } from "./index.js";

// Helper: feed all lines from a fixture through the engine
function feedLines(
  engine: ReturnType<typeof createEngine>,
  lines: string[]
) {
  let result = engine.getState();
  for (const line of lines) {
    result = engine.processLine(line, true);
  }
  return result;
}

// ── Fixtures (inline — mirror the JSON files) ─────────────────────────────────

const giftCardScam = [
  "This is the county clerk's office. There is a civil filing in your name.",
  "It has to be settled today or the filing goes forward.",
  "You need to buy gift cards and read me the codes on the back.",
  "Do not tell your bank, and do not talk to your family until the codes are in.",
];

const appointment = [
  "Hi, this is the clinic on Main. I'm calling to confirm your Thursday appointment at 2:30.",
  "Please arrive ten minutes early and bring your insurance card.",
  "If you need to reschedule, call the front desk.",
];

const remoteAccessScam = [
  "This is Microsoft security support. We have detected a virus on your computer.",
  "I need you to give me control of the screen so we can remove it.",
  "If you do not do this now, we will have to lock the account and contact the police.",
];

const loginCodeScam = [
  "This is your bank's fraud department. We detected suspicious activity on your account.",
  "To verify your identity, we just sent a code to your phone.",
  "Please read me the login code we just sent so we can confirm it's you.",
];

const birthdayGiftCards = [
  "Hey, I'm calling from Party Supplies Plus.",
  "We have a great deal on birthday gift cards this week.",
  "Would you like to order some for your party?",
];

const pastScamRecount = [
  "I wanted to warn you about something that happened to my neighbor.",
  "The guy said he was the IRS and told her to buy gift cards and read him the codes.",
  "She almost did it but her daughter stopped her and she hung up.",
];

const scorePathScam = [
  "This is the county sheriff's civil division. You have an outstanding judgment against you.",
  "Payment must be made by wire transfer within the hour or the warrant goes active.",
  "Do not discuss this with your family or your bank until the matter is resolved.",
  "This is time-sensitive and needs to be handled today.",
];

const warrantMention = [
  "This is Detective Harris from the county sheriff's office.",
  "We are investigating a fraud case and your name came up as a potential witness.",
  "We may need to speak with you at some point in the coming weeks.",
];

const downloadApp = [
  "Hi, this is customer support for your antivirus software.",
  "Download this app so we can talk and screen share to check your subscription status.",
  "It will only take a few minutes of your time.",
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ScamCallShield rules engine", () => {
  let engine: ReturnType<typeof createEngine>;

  beforeEach(() => {
    engine = createEngine();
  });

  // ── gift-card-scam ──────────────────────────────────────────────────────────
  describe("gift-card-scam", () => {
    it("triggers on line 3 (index 2) via high_risk path with warning-gift-card", () => {
      // Line 0 (index 0)
      engine.processLine(giftCardScam[0], true);
      // Line 1 (index 1)
      engine.processLine(giftCardScam[1], true);
      // Line 2 (index 2) — this must trigger
      const result = engine.processLine(giftCardScam[2], true);
      expect(result.triggered).toBe(true);
      expect(result.triggerPath).toBe("high_risk");
      expect(result.clipId).toBe("warning-gift-card");
    });

    it("does NOT change triggered state after line 3 fires (intervened flag)", () => {
      engine.processLine(giftCardScam[0], true);
      engine.processLine(giftCardScam[1], true);
      engine.processLine(giftCardScam[2], true);
      // Feed line 4 (index 3)
      const result = engine.processLine(giftCardScam[3], true);
      // Still triggered but no second trigger; clipId unchanged
      expect(result.triggered).toBe(true);
      expect(result.clipId).toBe("warning-gift-card");
    });
  });

  // ── appointment (benign) ────────────────────────────────────────────────────
  describe("appointment", () => {
    it("does NOT trigger", () => {
      const result = feedLines(engine, appointment);
      expect(result.triggered).toBe(false);
      expect(result.clipId).toBeUndefined();
      expect(result.score).toBe(0);
    });
  });

  // ── remote-access-scam ──────────────────────────────────────────────────────
  describe("remote-access-scam", () => {
    it("triggers via high_risk path with warning-remote-access", () => {
      const result = feedLines(engine, remoteAccessScam);
      expect(result.triggered).toBe(true);
      expect(result.triggerPath).toBe("high_risk");
      expect(result.clipId).toBe("warning-remote-access");
    });
  });

  // ── login-code-scam ─────────────────────────────────────────────────────────
  describe("login-code-scam", () => {
    it("triggers via high_risk path with warning-login-code", () => {
      const result = feedLines(engine, loginCodeScam);
      expect(result.triggered).toBe(true);
      expect(result.triggerPath).toBe("high_risk");
      expect(result.clipId).toBe("warning-login-code");
    });
  });

  // ── birthday-gift-cards (benign) ────────────────────────────────────────────
  describe("birthday-gift-cards", () => {
    it("does NOT trigger (gift cards mentioned but not as demand)", () => {
      const result = feedLines(engine, birthdayGiftCards);
      expect(result.triggered).toBe(false);
      expect(result.clipId).toBeUndefined();
    });
  });

  // ── past-scam-recount (benign) ──────────────────────────────────────────────
  describe("past-scam-recount", () => {
    it("does NOT trigger (third-person recounting context)", () => {
      const result = feedLines(engine, pastScamRecount);
      expect(result.triggered).toBe(false);
      expect(result.clipId).toBeUndefined();
    });
  });

  // ── score-path-scam ─────────────────────────────────────────────────────────
  describe("score-path-scam", () => {
    it("triggers via score path with warning-score", () => {
      const result = feedLines(engine, scorePathScam);
      expect(result.triggered).toBe(true);
      expect(result.triggerPath).toBe("score");
      expect(result.clipId).toBe("warning-score");
    });

    it("accumulates score >= 70 across payment + urgency + secrecy categories", () => {
      // After line 3 (secrecy), score = payment(30) + urgency(15) + secrecy(25) = 70
      // and categories.size = 3 — trigger fires on that line
      engine.processLine(scorePathScam[0], true);
      engine.processLine(scorePathScam[1], true);
      const resultAfterLine3 = engine.processLine(scorePathScam[2], true);
      expect(resultAfterLine3.triggered).toBe(true);
      expect(resultAfterLine3.score).toBeGreaterThanOrEqual(70);
      expect(resultAfterLine3.categoriesAwarded.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── warrant-mention (benign) ────────────────────────────────────────────────
  describe("warrant-mention", () => {
    it("does NOT trigger (authority claim but no demand)", () => {
      const result = feedLines(engine, warrantMention);
      expect(result.triggered).toBe(false);
      expect(result.clipId).toBeUndefined();
    });
  });

  // ── download-app (benign) ───────────────────────────────────────────────────
  describe("download-app", () => {
    it("does NOT trigger (download without threat)", () => {
      const result = feedLines(engine, downloadApp);
      expect(result.triggered).toBe(false);
      expect(result.clipId).toBeUndefined();
    });
  });

  // ── Cross-cutting concerns ──────────────────────────────────────────────────
  describe("interim lines", () => {
    it("never update score or trigger even for high-risk phrases", () => {
      // Feed a highly suspicious line as non-final
      const result = engine.processLine(
        "You need to buy gift cards and read me the codes on the back.",
        false // isFinal = false
      );
      expect(result.triggered).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("idempotency — same line twice", () => {
    it("does not award a category more than once", () => {
      const line =
        "Payment must be made by wire transfer within the hour or the warrant goes active.";
      engine.processLine(line, true);
      const first = engine.getState();
      engine.processLine(line, true);
      const second = engine.getState();
      // Score should not double
      expect(second.score).toBe(first.score);
      expect(second.categoriesAwarded.length).toBe(first.categoriesAwarded.length);
    });
  });

  describe("reset()", () => {
    it("clears all state back to initial", () => {
      feedLines(engine, scorePathScam);
      engine.reset();
      const state = engine.getState();
      expect(state.score).toBe(0);
      expect(state.triggered).toBe(false);
      expect(state.categoriesAwarded).toEqual([]);
      expect(state.clipId).toBeUndefined();
      expect(state.triggerPath).toBeUndefined();
      expect(state.evidence).toBeUndefined();
    });

    it("allows re-triggering after reset", () => {
      feedLines(engine, giftCardScam);
      engine.reset();
      const result = feedLines(engine, giftCardScam);
      expect(result.triggered).toBe(true);
      expect(result.clipId).toBe("warning-gift-card");
    });
  });
});
