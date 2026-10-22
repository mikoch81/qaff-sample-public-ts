# Performance strategy

How performance is exercised in this generated framework, and where the
advisory budgets live. `npm test` never runs a load tool; performance is an
explicit, opt-in step (see
[`../framework-performance/README.md`](../framework-performance/README.md)).

## Apps covered

- No generated app currently includes the `performance` layer.

## Levels

| Level | Concurrency | Cadence | Enforcement today | Owner |
| --- | --- | --- | --- | --- |
| **Smoke** | 1 virtual user, 1 flow | explicit local run; opt-in CI gate | advisory only | dev |
| **Regression** | low (e.g. 10–50 VUs) | future nightly run | advisory only | QA |
| **Load** | full target | future on-demand capacity review | advisory only | SRE / perf engineer |

The first two levels are about **regression detection** — catching the day a
refactor doubles the p95. Load is about **capacity**.

## Where the numbers live

- **Budgets** (advisory, provider-neutral):
  [`../framework-performance/thresholds.yaml`](../framework-performance/thresholds.yaml).
- **Baselines** (per app):
  `../framework-performance/baseline/<app-id>.baseline.json`.
- **Reference provider**: k6 (`apps/<id>/performance/k6/smoke.js`).

See [quality-gates.md](quality-gates.md) for the advisory-vs-strict gate model.
