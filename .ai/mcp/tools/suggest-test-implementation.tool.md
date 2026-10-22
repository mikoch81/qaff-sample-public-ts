# MCP tool — suggest_test_implementation

## Purpose

Turn the AI authoring contracts in `.ai/contracts/` into a deterministic
implementation plan: where the test belongs, what it should be called,
which steps and page-object methods follow from the evidence, and whether
the inputs are sufficient to start.

Until the TS AI Agent Pack lands (Phase 101) this project has no
`.ai/contracts/`, agents or prompts: pass the contracts inline, and
`guidance.present` is `false`.

## Inputs

Each contract can be passed inline as an object, or as a path under the
project root:

- `scenarioContract` / `scenarioContractRef`
- `testAuthoringRequest` / `testAuthoringRequestRef`
- `locatorEvidence` / `locatorEvidenceRef`
- `allureStepMapping` / `allureStepMappingRef`
- `app`, `layer` — override the target when the contracts disagree.

Nothing is required: with only a free-text `requirement` the tool
answers honestly with `BLOCKED` and lists the missing contracts.

## Outputs

`qaff/mcp-test-implementation-plan/v1`:

- `readiness` — `READY`, `NEEDS_REVIEW` or `BLOCKED`, with reason
  codes, `requiredInputs`, warnings and the commands that validate the
  work (`npm test`, `npx playwright test --project <layer>`).
- `target` — module, spec name and file path
  (`apps/<app>/<layer>/tests/<Name>.spec.ts`) and the Playwright test
  title, derived from `qa-factory.lock.json`; `basePackage` and
  `testPackage` are `null` (TypeScript has no packages);
  `appInLock` / `layerInLock` say whether the target actually exists yet.
- `steps` — scenario steps joined with their Allure step names and the
  expected results that belong to each.
- `pageObjects` — the page object to touch
  (`apps/<app>/<layer>/pages/<Name>Page.ts`), its getter methods and the
  candidate selectors from the evidence contract.
- `guidance` — which agent and prompt in `.ai/` fits this layer.

Steps and page objects are omitted while the verdict is `BLOCKED`.

## Side effects

None. The tool writes no files and emits no TypeScript code — it never invents
selectors, URLs or credentials. Applying the plan remains a human
decision.
