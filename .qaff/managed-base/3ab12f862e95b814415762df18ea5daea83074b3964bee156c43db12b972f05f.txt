# MCP tool — sync_testrail_results

## Purpose

Add test results to an **existing TestRail run** — the same
`add_results_for_cases` body as `qaff sync-test-results --provider testrail`.
It never creates cases or runs.

## Inputs

- `runId` — existing TestRail run id supplied by the user (required).
- `app` — optional app id (informational).
- `executions` — non-empty array of `{ caseKey | caseId, status, comment? }` with an
  Allure status. Case keys are `C<number>` or `<number>`; `passed` → 1,
  `failed` / `broken` → 5. Skipped / unknown results and keys that are not
  case ids are left out and reported in `warnings` (TestRail rejects
  status 3 on `add_results_for_cases`).

## Environment

- Default: none — the tool writes
  `.ai/mcp/outbox/testrail-results.request.json`
  (`{ tool, mode, target, request, warnings }`) and sends nothing.
- `TESTRAIL_ENABLE_LIVE_WRITE=true` to post, plus `TESTRAIL_URL`,
  `TESTRAIL_USER` and `TESTRAIL_API_KEY` (Basic auth).

## Outputs

- `INVALID_INPUT` (`invalidFields` / `invalidExecutions`) — nothing written or sent.
- `DRY_RUN_WRITTEN` with `outputRef`, `target` and `warnings` (default).
- `CREDENTIALS_REQUIRED` when live write is enabled but credentials are absent.
- `LIVE_WRITE_OK` / `LIVE_WRITE_FAILED` (HTTP status and status text only).

## Side effects

A local file write by default; one
`POST index.php?/api/v2/add_results_for_cases/<runId>` in live mode.
Credentials are read from the environment only and never stored.
