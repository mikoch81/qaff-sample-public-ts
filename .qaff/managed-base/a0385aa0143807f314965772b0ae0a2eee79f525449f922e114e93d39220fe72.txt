# reports/

Destination folder for advisory threshold evaluation and baseline comparison reports.

## Generating reports

Produce a result file by running your k6 scenario and importing its summary,
then evaluate it:

```sh
# Run k6 locally (requires the k6 binary; never run by npm test or CI)
k6 run --env QAFF_PERF_BASE_URL=http://localhost:3000 apps/<app-id>/performance/k6/smoke.js

# Import the k6 summaries from providers/k6/input/ into reports/
bash scripts/run-k6-import-smoke.sh

# Evaluate all performance apps at once (project mode — advisory)
qaff evaluate-quality-impact --project .

# Evaluate with strict enforcement gate (exits 1 on OVER_THRESHOLD metrics or REGRESSION baselines)
qaff evaluate-quality-impact --project . --strict

# Or evaluate a single app using explicit file paths
qaff evaluate-quality-impact \
  --thresholds framework-performance/thresholds.yaml \
  --baseline  framework-performance/baseline/<app-id>.baseline.json \
  --result    framework-performance/reports/<app-id>.result.json \
  --threshold-report framework-performance/reports/<app-id>.threshold-evaluation.json \
  --baseline-report  framework-performance/reports/<app-id>.baseline-comparison.json

# Single-app with strict enforcement
qaff evaluate-quality-impact \
  --thresholds framework-performance/thresholds.yaml \
  --baseline  framework-performance/baseline/<app-id>.baseline.json \
  --result    framework-performance/reports/<app-id>.result.json \
  --threshold-report framework-performance/reports/<app-id>.threshold-evaluation.json \
  --baseline-report  framework-performance/reports/<app-id>.baseline-comparison.json \
  --strict
```

## Updating the baseline after acceptance

Once you have reviewed the results and accepted the new performance numbers,
update the baseline so future evaluations compare against it:

```sh
# Project mode — updates baselines for all performance apps at once
qaff update-baseline --project .

# File mode — update a single app baseline explicitly
qaff update-baseline \
  --result   framework-performance/reports/<app-id>.result.json \
  --baseline framework-performance/baseline/<app-id>.baseline.json
```

Commit the updated `framework-performance/baseline/<app-id>.baseline.json`
to record the acceptance decision in version control. The command overwrites the
target baseline file deterministically.

## Report files written by `qaff evaluate-quality-impact`

| File | Schema |
|------|--------|
| `reports/<app-id>.threshold-evaluation.json` | `qaff/threshold-evaluation/v1` |
| `reports/<app-id>.baseline-comparison.json` | `qaff/baseline-comparison/v1` |

## Advisory enforcement (default)

Without `--strict`, reports are **non-blocking**: `status: advisory` and `enforcement: none`.
Verdicts of `OVER_THRESHOLD` or `REGRESSION` do not fail any build, generated script,
or CI step. The command exits 0 regardless of verdict.

## Strict enforcement gate (`--strict`)

Pass `--strict` to turn the evaluator into a hard gate:

- Exits **1** when any metric verdict is `OVER_THRESHOLD` or any baseline verdict is `REGRESSION`.
- `INSUFFICIENT_DATA` and `NOT_EVALUATED` are **never** treated as strict failures.
- Reports are always written regardless of the gate result.
- `--json` output includes a `strict` boolean and `status: "GATE_FAILED"` when the gate fires.

## Not emitted today by generated scripts

- `qaff create`, `qaff verify`, `npm test`, and generated CI files do **not**
  call `qaff evaluate-quality-impact` or `qaff update-baseline` automatically.
- The opt-in CI flags (`ci.<provider>.strictQualityGate`,
  `ci.<provider>.trendReport`) add explicit evaluate / trend steps.
- Otherwise call the commands manually or add them as explicit post-steps in
  your CI pipeline if desired.
