# How to use the Allure report

`npm test` runs the pinned `allure-playwright` reporter next to Playwright's
HTML reporter. It writes raw results for every app and layer to
`allure-results/` (git-ignored).

## Build the HTML report

```bash
npm test                         # writes allure-results/
npm run allure:report            # allure-results/ -> allure-report/ (clears it first)
npx allure open allure-report    # serve the report locally
```

`allure:report` uses the pinned Allure 3 CLI (npm package `allure`) — pure
Node.js, no JDK. Open `allure-report/index.html` through `allure open` (or any
static web server), not straight from disk: the report loads its data with
`fetch`. `allure-report/` is git-ignored.

## In CI

Every pipeline with `ci.<provider>.allureReport: true` runs
`npm run allure:report` after the tests, even when they fail, and keeps the
result as the `allure-report` artifact. A failed report build only logs a
message; it never fails the pipeline.

## Annotating tests

Optional metadata (owner, severity, links, steps) comes from the
`allure-js-commons` API, which `allure-playwright` already installs. Declare
it as a devDependency (same version as `allure-playwright`) before importing
it: `import * as allure from "allure-js-commons";` then
`await allure.severity("critical");` inside a test.
