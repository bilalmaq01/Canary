import { describe, it, expect, beforeEach } from "vitest";
import { createEngine } from "./index.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  id: number;
  group: string;
  title: string;
  label: "scam" | "benign";
  lines: string[];
  expected: string;
  note?: string;
}

const fixtures: Fixture[] = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/scam_script_fixtures.json"), "utf-8")
);

function runFixture(lines: string[]) {
  const engine = createEngine();
  let result = engine.getState();
  for (const line of lines) {
    result = engine.processLine(line, true);
  }
  return result;
}

const shouldTrigger = fixtures.filter((f) =>
  ["HIGH-RISK path", "Score path", "Near miss"].includes(f.expected)
);
const shouldNotTrigger = fixtures.filter((f) =>
  ["No trigger", "Stays quiet"].includes(f.expected)
);

describe("scam_script_fixtures — should trigger", () => {
  for (const f of shouldTrigger) {
    it(`#${f.id} [${f.group}] ${f.title} (${f.expected})`, () => {
      const result = runFixture(f.lines);
      expect(result.triggered, `score=${result.score} cats=${result.categoriesAwarded.join(",")}`).toBe(true);
    });
  }
});

describe("scam_script_fixtures — should NOT trigger", () => {
  for (const f of shouldNotTrigger) {
    it(`#${f.id} [${f.group}] ${f.title}${f.note ? " — " + f.note : ""}`, () => {
      const result = runFixture(f.lines);
      expect(result.triggered, `score=${result.score} cats=${result.categoriesAwarded.join(",")}`).toBe(false);
    });
  }
});
