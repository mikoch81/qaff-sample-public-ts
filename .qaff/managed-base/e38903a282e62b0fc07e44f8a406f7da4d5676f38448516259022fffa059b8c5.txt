# k6 provider (reference)

[Grafana k6](https://k6.io) is the reference performance provider for the
ts-npm-playwright blueprint. Each app with the `performance` layer ships a
`k6/smoke.js` template; its `handleSummary` writes a JSON summary into
`framework-performance/providers/k6/input/<app-id>.summary.json`.

## Status

- ✅ Script template generated per performance app (`apps/<id>/performance/k6/smoke.js`).
- ✅ Import adapter: `qaff import-performance-result --provider k6` and the
  generated `run-k6-import-smoke` helper scripts normalize summaries into
  `qaff/performance-result/v1`.
- ❌ k6 is **not** run by `npm test` or by any generated CI step — it needs the
  k6 binary and is invoked explicitly.

## Flow

```sh
k6 run --env QAFF_PERF_BASE_URL=http://localhost:3000 apps/<app-id>/performance/k6/smoke.js
bash scripts/run-k6-import-smoke.sh
qaff evaluate-quality-impact --project .
```

Drop pre-produced summaries in `input/<app-id>.summary.json` if you run k6
elsewhere; the helper scripts skip missing files.
