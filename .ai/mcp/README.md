# .ai/mcp — Local MCP Toolkit

> **Status: minimal local runtime.** A dependency-free Node.js MCP server
> lives at ".ai/mcp/server/server.js". Four of its tools do real local
> work — repository inspection, Allure result reading, Quality Impact
> comparison and authoring planning — reading only files inside this
> repository. The Zephyr writeback and the Jira comment tool write a
> local dry-run file by default, with a credential-gated live write only
> when explicitly enabled. The generated server stores no credentials and
> makes no network call unless you turn Zephyr or Jira live write on.

## What is in this directory

| File | Purpose | Status |
| --- | --- | --- |
| `server.manifest.json` | Server identity, capabilities and tool list. | runtime metadata |
| `server/server.js` | Local stdio JSON-RPC server plus `--list-tools` and `--self-test`. | implemented |
| `mcp-config.example.json` | Example MCP client config pointing at the local server. | example |
| `tools/*.tool.md` | Tool contracts: inputs, outputs, side effects, environment. | contract |
| `test-results-mcp.md` | Legacy spec for Allure result access. | compatibility spec |
| `performance-results-mcp.md` | Legacy spec for Quality Impact Pack outputs. | compatibility spec |
| `repository-inspection-mcp.md` | Legacy spec for generated repository inspection. | compatibility spec |

## Local checks

From the generated repository root:

```sh
node .ai/mcp/server/server.js --list-tools
node .ai/mcp/server/server.js --self-test
```

The self-test checks that the eight documented tools are exposed and runs
the ported evaluators against inline fixtures — the YAML subset reader,
the Allure summary, the threshold and baseline evaluators and the
authoring readiness rules. It touches no files and makes no network call.

## What is NOT shipped (be explicit)

- No hosted agent runner.
- No connector to GitHub Issues, Slack or Microsoft Teams (the qaff CLI
  ships opt-in Slack / Teams commands; the MCP server does not call them).
- No Jenkins / GitHub Actions integration.
- No connector to a real Gatling / k6 / JMeter execution backend.
- No automatic writes to source code, baselines, issue trackers or CI.
- No flakiness history: results from a single run cannot prove a flake.
- No Playwright JSON / HTML report parsing; result reading uses the raw
  `allure-results/` written by the allure-playwright reporter.

## Tool behavior

| Tool | Behavior |
| --- | --- |
| `read_test_results` | Reads local Allure results per app and layer and returns totals, failed tests with categories, failing step names and error excerpts. |
| `compare_performance_baseline` | Evaluates a normalized performance result against `thresholds.yaml` and the committed baseline. Advisory: it never gates and never updates a baseline. |
| `attach_report_to_jira` | Summarizes local Allure results as one Jira comment (same body as `qaff sync-test-results --provider jira-comment`). Writes a local dry-run request by default; posts the comment only when `JIRA_ENABLE_LIVE_WRITE=true` and `JIRA_BASE_URL` / `JIRA_USER` / `JIRA_TOKEN` are present. Never creates issues. |
| `create_zephyr_execution` | MVP connector: writes a local dry-run request artifact by default. Optional live write is enabled only when `ZEPHYR_ENABLE_LIVE_WRITE=true` and required credentials are present. |
| `sync_xray_results` | Builds the Xray Cloud JSON import body (same as `qaff sync-test-results --provider xray-cloud`) from the `executions` you pass. Writes a local dry-run request by default; imports into the existing project / Test Execution only when `XRAY_ENABLE_LIVE_WRITE=true` and `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` are present. Never creates test cases. |
| `sync_testrail_results` | Builds the TestRail `add_results_for_cases` body (same as `qaff sync-test-results --provider testrail`) for an existing run. Writes a local dry-run request by default; posts only when `TESTRAIL_ENABLE_LIVE_WRITE=true` and `TESTRAIL_URL` / `TESTRAIL_USER` / `TESTRAIL_API_KEY` are present. Never creates cases or runs. |
| `inspect_repository_structure` | Reads `qa-factory.lock.json` and reports apps, layers and pack metadata. |
| `suggest_test_implementation` | Turns the `.ai/contracts/` authoring contracts into a deterministic implementation plan: readiness verdict, target spec file, steps, page objects and which prompt to use. It writes no files and emits no code. Until the TS AI Agent Pack lands (Phase 101) there is no `.ai/contracts/` here: pass the contracts inline; `guidance.present` is `false`. |

The four local tools are deterministic ports of the generator's own
modules, so their verdicts agree with the `qaff` CLI for the same inputs.

All tools reject path traversal outside the project root when a path
input is supplied.
