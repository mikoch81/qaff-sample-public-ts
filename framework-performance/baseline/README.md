# baseline/

Golden performance numbers used by the comparison engine. Each app gets
its own `<app-id>.baseline.json` file; commit it to track the current
accepted performance and update it when an intentional change shifts the
numbers.

## Updating the baseline

After reviewing an accepted result file, update the baseline with:

```sh
# Project mode — updates baselines for all performance apps at once
qaff update-baseline --project .

# File mode — update a single app baseline explicitly
qaff update-baseline \
  --result  framework-performance/reports/<app-id>.result.json \
  --baseline framework-performance/baseline/<app-id>.baseline.json
```

Both modes write a deterministic `qaff/performance-baseline/v1` JSON.
`capturedAt` is taken from the result's `generatedAt` field when
present; otherwise a deterministic placeholder is used and a warning is
included in the summary. `capturedBy` is always `qaff update-baseline`.

The existing baseline is always overwritten — use git to track history.

## Verifying after an update

Run `qaff evaluate-quality-impact --project .` after updating to confirm
the new baseline produces the expected advisory verdict.
