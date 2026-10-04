import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEngine } from "./index.js";

interface JudgingFixture {
  id: number;
  group: string;
  title: string;
  label: "scam" | "benign";
  lines: string[];
  expected_trigger: boolean;
  scenario_id: string;
  presentation: string;
}

const fixtures: JudgingFixture[] = JSON.parse(
  readFileSync(new URL("../../fixtures/judging_fixtures_1000.json", import.meta.url), "utf8")
);

// Fail during collection if a case is lost, duplicated, or silently mislabeled.
if (
  fixtures.length !== 1000 ||
  new Set(fixtures.map((f) => f.id)).size !== 1000 ||
  new Set(fixtures.map((f) => JSON.stringify(f.lines))).size !== 1000 ||
  fixtures.some((f) =>
    !["scam", "benign"].includes(f.label) ||
    f.expected_trigger !== (f.label === "scam") ||
    !f.lines.length || f.lines.some((line) => typeof line !== "string" || !line.trim())
  )
) {
  throw new Error("Expected 1,000 unique, nonempty, consistently labeled judging fixtures");
}

describe("judging corpus (500 scam / 500 benign)", () => {
  for (const fixture of fixtures) {
    it(`#${fixture.id} [${fixture.group}] ${fixture.title}`, () => {
      const engine = createEngine();
      for (const line of fixture.lines) engine.processLine(line, true);
      const result = engine.getState();
      const diagnostic = JSON.stringify({ fixture: fixture.id, lines: fixture.lines, result });
      expect(result.triggered, diagnostic).toBe(fixture.expected_trigger);
      if (fixture.expected_trigger) {
        expect(result.clipId, diagnostic).toBeDefined();
        expect(result.evidence?.quotedLine, diagnostic).toBeDefined();
      } else {
        expect(result.clipId, diagnostic).toBeUndefined();
        expect(result.triggerPath, diagnostic).toBeUndefined();
      }
    });
  }
});
