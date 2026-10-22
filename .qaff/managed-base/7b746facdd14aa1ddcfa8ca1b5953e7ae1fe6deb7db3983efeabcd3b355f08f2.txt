# MCP tool — sync_xray_results

## Purpose

Import test results into **Xray Cloud** for an existing Jira project or an
existing Test Execution — the same JSON import body as
`qaff sync-test-results --provider xray-cloud`. It never creates test
cases; Xray may create a Test Execution when no `testExecKey` is given.

## Inputs

- `projectKey` — Jira project key supplied by the user (required, e.g. `DEMO`).
- `testExecKey` — optional existing Test Execution key (e.g. `DEMO-12`).
- `app` — optional app id, used in the import summary
  (`qaff Allure results: <project>/<app>`).
- `executions` — non-empty array of `{ caseKey | testKey, status, comment? }` with an
  Allure status (`passed` / `failed` / `broken` / `skipped` / `unknown`):
  `passed` → `PASSED`, `failed` / `broken` → `FAILED`, others → `TODO`.

## Environment

- Default: none — the tool writes `.ai/mcp/outbox/xray-import.request.json`
  (`{ tool, mode, target, request, warnings }`) and sends nothing.
- `XRAY_ENABLE_LIVE_WRITE=true` to import, plus `XRAY_CLIENT_ID` and
  `XRAY_CLIENT_SECRET` (an Xray Cloud API key); optional `XRAY_BASE_URL`
  (default `https://xray.cloud.getxray.app`).

## Outputs

- `INVALID_INPUT` (`invalidFields` / `invalidExecutions`) — nothing written or sent.
- `DRY_RUN_WRITTEN` with `outputRef` and `target` (default).
- `CREDENTIALS_REQUIRED` when live write is enabled but credentials are absent.
- `LIVE_WRITE_OK` / `LIVE_WRITE_FAILED` (`step` `authenticate` or `import`,
  HTTP status and status text only; response bodies are never echoed).

## Side effects

A local file write by default; in live mode `POST /api/v2/authenticate`
then `POST /api/v2/import/execution`. The bearer token is used once and
never stored; credentials are read from the environment only.
