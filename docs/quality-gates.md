# Quality gates

The Quality Impact evaluation is **advisory by default** and only becomes a
hard gate when you opt in.

## Advisory (default)

`qaff evaluate-quality-impact --project .` reads
`framework-performance/thresholds.yaml` (`status: advisory`,
`enforcement: none`) plus each app's baseline and result file, and writes:

| File | Schema |
| --- | --- |
| `reports/<app>.threshold-evaluation.json` | `qaff/threshold-evaluation/v1` |
| `reports/<app>.baseline-comparison.json` | `qaff/baseline-comparison/v1` |

It exits 0 regardless of verdict.

## Strict gate (opt-in)

`qaff evaluate-quality-impact --project . --strict` exits **1** when any metric
verdict is `OVER_THRESHOLD` or any baseline verdict is `REGRESSION`.
`INSUFFICIENT_DATA` and `NOT_EVALUATED` are **never** treated as failures.

## In CI

The opt-in per-provider flags add explicit steps to the generated pipelines:

- `ci.<provider>.strictQualityGate` → `qaff evaluate-quality-impact --strict`.
- `ci.<provider>.trendReport` / `strictTrendGate` → `qaff trend-report`.

The offline producer flag (`ci.<provider>.performanceRun`) is **Java-only** and
is rejected at config validation for this blueprint — run k6 yourself and import
the summaries with `qaff import-performance-result --provider k6` (or the
generated `run-k6-import-smoke` scripts).
