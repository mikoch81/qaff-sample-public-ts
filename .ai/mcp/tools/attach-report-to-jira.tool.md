# MCP tool — attach_report_to_jira

## Purpose

Summarize the local Allure results as **one** comment on an existing Jira
issue — the same Atlassian Document Format body as
`qaff sync-test-results --provider jira-comment`: verdict, totals (passed /
failed / broken / skipped) and optional links to the CI run and the report.
It never creates issues and never attaches files.

## Inputs

- `issueKey` — Jira issue key supplied by the user (required, e.g. `DEMO-12`).
- `app` / `layer` — optional; narrow the results like `read_test_results`.
- `runRef` — optional repo-relative Allure results directory.
- `runUrl` / `reportUrl` — optional http(s) links added to the comment.
- `comment` — optional extra paragraph.

## Environment

- Default: none — the tool writes `.ai/mcp/outbox/jira-comment.request.json`
  with the request body and sends nothing.
- `JIRA_ENABLE_LIVE_WRITE=true` to post the comment, plus `JIRA_BASE_URL`,
  `JIRA_USER` and `JIRA_TOKEN` (an Atlassian API token, Basic auth).

## Outputs

- `DRY_RUN_WRITTEN` with `outputRef` and `totals` (default).
- `LIVE_WRITE_OK` / `LIVE_WRITE_FAILED` (HTTP status and status text only;
  the response body is never echoed).
- `CREDENTIALS_REQUIRED` when live write is enabled but credentials are absent.
- `INVALID_INPUT` / `ERROR` (no local results) — nothing written or sent.

## Side effects

A local file write by default; one `POST /rest/api/3/issue/<key>/comment` in
live mode. Tokens are read from the environment only and never stored.
