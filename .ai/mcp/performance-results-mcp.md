# MCP spec — performance-results

> **Status: compatibility spec.** The local MCP server implements the
> comparison half of this spec: `compare_performance_baseline` evaluates
> a normalized result against `thresholds.yaml` and the committed
> baseline with the same verdicts as `qaff evaluate-quality-impact`
> (see `tools/compare-performance-baseline.tool.md`). Still
> unimplemented from the spec below: trend history across runs and
> baseline-update proposals. The MCP tool only **reads** Quality Impact
> Pack outputs — it does not execute Gatling, k6, JMeter or JMH.

## Intended purpose

Expose the Quality Impact Pack's structured outputs to an agent:

- Budgets (`framework-performance/thresholds.yaml`).
- Baselines (`framework-performance/baseline/<app>.baseline.json`).
- Trend reports (`framework-performance/reports/`).

## Resources

| URI scheme | Returns |
| --- | --- |
| `perf://thresholds` | Parsed `thresholds.yaml`. |
| `perf://baseline/<app>` | Parsed baseline JSON for one app. |
| `perf://reports/<reportId>` | A trend report (JSON), if present. |

## Tools

### `compare_run_to_baseline`

Inputs:
- `app` (string).
- `scenario` (string) — must exist in baseline.
- `current` (object) — current normalised metrics for that scenario.

Output: `{ verdict: PASS | REGRESSION | OVER-BUDGET | INSUFFICIENT-DATA, deltas: [...] }`
following the contract in
`.ai/agents/performance-analyst.agent.md`.
That agent ships with the TS AI Agent Pack (Phase 101); it is not
present in this project yet.

### `propose_baseline_update`

Inputs:
- `app`, `scenario`, `current`, `reason` (free text).

Output: a JSON patch the human can apply to the baseline file. The
server must **never** write to the baseline directly.

## Hard rules for the future implementation

- Read-only by default. `propose_baseline_update` returns a patch,
  it does not apply it.
- Must reject any `current` payload that, if accepted, would violate
  `thresholds.yaml`.
- Must not call out to a real performance runner. The server consumes
  metrics that arrive as inputs.
