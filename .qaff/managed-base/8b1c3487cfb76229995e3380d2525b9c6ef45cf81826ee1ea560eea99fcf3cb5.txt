# MCP tool — create_zephyr_execution

## Purpose

Create Zephyr execution records from local test results. In Phase 4.0,
the default mode is local dry-run artifact output; optional live write
is available only when explicitly enabled.

## Inputs

- `projectKey` — Zephyr project key supplied by the user.
- `cycleKey` — optional cycle key.
- `executions` — non-empty array of `{ testCaseKey | testKey, status, executionTime?, comment? }`
  records. Each one is sent as its own `POST /v2/testexecutions` request with the
  same body as `qaff sync-zephyr-results`:
  `{ projectKey, testCaseKey, testCycleKey?, statusName, executionTime, comment }`.

## Required environment

- `ZEPHYR_BASE_URL` — `https://api.zephyrscale.smartbear.com` (or a region host such as
  `https://eu.api.zephyrscale.smartbear.com`); a trailing `/v2` is accepted.
- `ZEPHYR_TOKEN`
- `ZEPHYR_ENABLE_LIVE_WRITE=true` to enable network write mode.

## Outputs

- `INVALID_INPUT` when `executions` is missing or empty (`invalidFields`) or any
  execution lacks a case key or status (`invalidExecutions` lists the indexes); nothing
  is written or sent.
- `DRY_RUN_WRITTEN` (default): writes
  `.ai/mcp/outbox/zephyr-execution.request.json` with the raw `request` and
  the per-execution `requests[]` live mode would send.
- `CREDENTIALS_REQUIRED` when live mode is enabled but required
  credentials are absent.
- `LIVE_WRITE_OK` when live mode is enabled and all N per-execution requests
  are accepted. Live results carry `endpoint`, `submitted` and `responses[]`
  (`testCaseKey`, `httpStatus`, `ok`, `responseBody`).
- `LIVE_WRITE_FAILED` when any request is rejected, or `NETWORK_ERROR` when a
  request cannot be sent (`responses[]` holds the requests sent before it).

## Side effects

- Dry-run mode: local file write only.
- Live mode: creates or updates Zephyr execution data through Zephyr REST API.
