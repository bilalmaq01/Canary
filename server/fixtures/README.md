# Call judging fixtures

`scam_script_fixtures.json` contains the original 74 cases. Its scam label and
trigger expectation can differ: some early scam signals intentionally stay below
the intervention threshold.

`judging_fixtures_1000.json` adds **1,000 cases** tested by
`server/src/engine/judging-fixtures.test.ts`:

- 500 scam calls with active demands or coercion that should trigger.
- 500 benign calls that should stay quiet, including gift giving, scam recounts,
  bank callbacks, delivery codes, app setup, and harmless similar words.
- 50 scenario families, each with five authored phrasings and four presentations:
  natural case, lowercase, uppercase, and a single merged transcript segment.

These are 250 distinct underlying scripts with presentation variants, **not 1,000
independently sourced real-world conversations**. Each JSON entry has a unique
ID, group, title, label, caller `lines`, explicit `expected_trigger`, `scenario_id`,
presentation, and a short rationale. Expectations are authored independently of
the engine; the generator does not call the engine to choose labels.

Run all tests from the repository root:

```sh
npm test
```

Regenerate the corpus after editing the scenario definitions:

```sh
python3 server/fixtures/tools/generate-judging-fixtures.py
```

The test runner creates a fresh engine for every case, feeds final caller lines,
checks whether intervention occurs, and checks warning/evidence presence. It
rejects missing cases, duplicate IDs, duplicate transcripts, empty lines, and
inconsistent labels during collection. It makes no Gemini requests and needs no
API key.

## Evaluation and training limits

Running unit tests does not train the rules engine or Gemini. This corpus is a
regression suite and a starting point for labeled judge evaluation. If exported
for training or evaluation, split by `scenario_id`, never randomly by row: all
related wording and presentation variants must remain in the same split to
avoid leakage. Keep separate, independently authored holdout conversations.

This suite does not establish real-world accuracy. It does not cover every
negation, quoted threat, multilingual call, speech recognition error, ambiguous
payment request, or gradual long-call escalation. Its assertions check eventual
intervention, not the exact first intervention line, score, category, or warning
selection. Use additional reviewed cases for those behaviors.
