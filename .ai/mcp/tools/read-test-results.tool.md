# MCP tool — read_test_results

## Purpose

Summarize the local Allure results this repository already produced, per
app and layer. The reader is the same one `qaff analyze-failures` uses,
so totals, failure categories and warnings match the CLI exactly.

On this Playwright project the allure-playwright reporter writes one root
`allure-results/` directory (`npm test`); each result is attributed to
an app and layer from its spec path (`apps/<id>/<layer>/tests/*.spec.ts`).

## Inputs

All optional. With no arguments the tool reads every app and layer in
`qa-factory.lock.json`.

- `app` — restrict to one app id.
- `layer` — restrict to one layer.
- `runRef` — read one explicit `allure-results` directory under the
  project root instead of the lock-driven layout.

## Outputs

`qaff/mcp-test-results/v1`:

- `apps[]` — one entry per app, each with `layers[]`.
- `layers[].totals` — `total`, `passed`, `failed`, `broken`,
  `skipped`, `unknown`, `durationMs`.
- `layers[].failedTests[]` — name, status, `failureCategory`
  (`assertion_failure`, `exception`, `broken_test`, …), Allure labels,
  the failing step names, an attachment count, and the error message with
  a stack-trace excerpt capped at 400 characters
  (`traceTruncated` says whether it was cut).
- `layers[].failureAnalysis` — the verdict of an existing
  `qaff analyze-failures` report, when one is on disk. The server never
  computes an analysis itself.
- A layer without results is reported as `present: false` with a
  `skipReason`; `performance` is skipped by design (use
  `qaff import-performance-result`).

## Not implemented

Flakiness detection and history need results from several runs, which this
repository does not store; Playwright's own JSON / HTML reports are not parsed. Attachment
*contents* (screenshots, page sources) are never read — only their count.

## Side effects

None. The tool is read-only and rejects paths outside the project root.
