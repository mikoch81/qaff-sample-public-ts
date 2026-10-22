# MCP tool — compare_performance_baseline

## Purpose

Evaluate a normalized performance result against
`framework-performance/thresholds.yaml` and the committed baseline, using
the same evaluators as `qaff evaluate-quality-impact`. Advisory only.

## Inputs

- `app` — app id. Required unless `runRef` is given.
- `runRef` — result JSON path; defaults to
  `framework-performance/reports/<app>.result.json`.
- `baselineRef` — defaults to
  `framework-performance/baseline/<app>.baseline.json`.
- `thresholdsRef` — defaults to `framework-performance/thresholds.yaml`.
- `scenario` — optional guard; a mismatch with the result is an error
  rather than a silent re-interpretation.

## Outputs

- `thresholdEvaluation` — a `qaff/threshold-evaluation/v1` report;
  verdict `PASS`, `OVER_THRESHOLD`, `INSUFFICIENT_DATA` or
  `NOT_EVALUATED`.
- `baselineComparison` — a `qaff/baseline-comparison/v1` report;
  verdict `PASS`, `REGRESSION`, `INSUFFICIENT_DATA` or
  `NOT_EVALUATED`, with per-metric absolute and relative deltas.
- `cliReports` — paths of the reports `qaff evaluate-quality-impact`
  wrote, when they exist, so you can cross-check.

## thresholds.yaml support

The server is dependency-free, so it reads a documented YAML subset:
2-space block mappings, scalar values and `#` comments — which is what
the generated file uses. Flow collections, sequences, anchors and block
scalars are reported as an explicit error pointing at
`qaff evaluate-quality-impact --project .`, never as a silent
`NOT_EVALUATED`.

## Side effects

None. The tool never gates a build and never updates baselines; use
`qaff update-baseline` explicitly after human review.
