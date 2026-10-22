# framework-performance

Advisory, provider-neutral Quality Impact model for this framework. It holds
the performance **thresholds**, per-app **baselines**, and the **reports**
that `qaff evaluate-quality-impact` writes. Nothing here runs during
`npm test`; performance execution is an explicit, opt-in step.

## Layout

| Path | Purpose |
| --- | --- |
| `thresholds.yaml` | Advisory, provider-neutral budgets (`status: advisory`). |
| `baseline/<app>.baseline.json` | Accepted golden numbers per app (`qaff/performance-baseline/v1`). |
| `reports/` | Threshold-evaluation and baseline-comparison output. |
| `reports/history/` | Archived result files (populated by `--force` re-imports). |
| `reports/samples/` | Deliberate-regression teaching fixtures. |
| `providers/k6/` | The reference k6 provider (script template + import input). |

## Result contract — `qaff/performance-result/v1`

Every provider normalizes into one JSON shape that the evaluator consumes:

```json
{
  "$schema": "qaff/performance-result/v1",
  "app": "demo-ecommerce",
  "scenario": "demo-ecommerce-smoke",
  "level": "smoke",
  "metrics": {
    "responseTime": { "p50Ms": 0, "p95Ms": 0, "p99Ms": 0 },
    "errorRate": { "percent": 0 },
    "throughput": { "requestsPerSecond": 0 },
    "sample": { "requests": 0, "durationSeconds": 0 }
  }
}
```

## Producing a result with k6 (offline, opt-in)

k6 is the TS blueprint's reference provider. It is never run by `npm test`
or generated CI — you run it explicitly:

```sh
# Requires the k6 binary (https://k6.io). Writes a summary into providers/k6/input/.
k6 run --env QAFF_PERF_BASE_URL=http://localhost:3000 apps/<app-id>/performance/k6/smoke.js

# Normalize the committed summaries into reports/<app>.result.json
bash scripts/run-k6-import-smoke.sh

# Evaluate (advisory by default; add --strict to gate)
qaff evaluate-quality-impact --project .
```

You can import any provider `qaff` supports (`--provider k6|jmeter|gatling`);
only the k6 template and helper scripts are generated.
