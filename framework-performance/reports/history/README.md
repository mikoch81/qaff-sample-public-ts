# framework-performance/reports/history/

This directory stores **archived historical performance result files** collected
over successive test runs.

## How files end up here

When you re-import a result with `--force` and a result file already exists,
`qaff import-performance-result` archives the old file here before overwriting:

```
qaff import-performance-result --project . --provider jmeter \
  --input ./results.jtl --app demo-ecommerce --level smoke --scenario home-page --force
```

Archive files follow the naming convention:

```
<app-id>-<generatedAt-sanitized>.result.json
```

For example: `demo-ecommerce-2024-03-15T10-00-00Z.result.json`

The timestamp is taken from the existing file's `generatedAt` field — never the
system clock — so filenames are deterministic and reproducible.

## Trend reports

Once at least two historical runs are present, generate a trend report:

```
# Single app
qaff trend-report --project . --app demo-ecommerce

# All performance apps
qaff trend-report --project . --all-apps

# Limit to last 20 runs
qaff trend-report --project . --app demo-ecommerce --window 20

# Filter to a specific level
qaff trend-report --project . --app demo-ecommerce --level smoke
```

Reports are written to `framework-performance/reports/<app-id>.trend-report.json`
and `framework-performance/reports/<app-id>.trend-report.md`.

## File retention

There is no automatic retention policy. Remove old files manually or add a CI
cleanup step if the directory grows too large.

## Git usage

Commit this directory (or exclude it with `.gitignore`) depending on whether
you want to track performance history in version control. Committing it
provides a full audit trail; excluding it keeps the repo lean.
