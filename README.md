# client-demo-public-ts-qa — QA automation framework

A generated, **owned** end-to-end test framework: TypeScript + Playwright in
an npm-workspaces monorepo. It has no runtime dependency on the generator
that produced it — edit everything freely.

## Quickstart

```bash
npm install
npx playwright install
npm test               # builds + typechecks the workspace, then runs Playwright
npm run test:report    # open the HTML report of the last run
```

The web smokes of `demo-todo` drive the configured external URL
(see *External web targets* below); the remaining smokes run offline against bundled
`file://` HTML fixtures.

## Layout

| Package | Purpose |
| --- | --- |
| `framework-core` | framework-agnostic helpers |
| `framework-web` | `BasePage` / `PageComponent` base classes |
| `apps/<id>/<layer>` | one package per application and layer |

Each app package holds `pages/` (page objects), `tests/` (specs) and
`fixtures/` (offline test targets). Run a single app's suite with
`npm test -w @client-demo-public-ts-qa/<app-id>-<layer>`.

## Pointing tests at your real application

Replace the `file://` fixture URL in a spec (or set a `baseURL` in
[playwright.config.ts](playwright.config.ts)) and drive your deployed app.
Keep the offline smoke tests — they protect the framework itself.

### External web targets

`npm test` runs the web smoke of these apps against the configured URL, so it fails until
that URL is reachable — replace a placeholder such as `https://example.invalid` first:

- `demo-todo` → `https://demo.playwright.dev/todomvc`

Override at runtime with `QAFF_WEB_BASE_URL` (URL) and `QAFF_WEB_SMOKE_HEADING_SELECTOR` /
`QAFF_WEB_SMOKE_HEADING_TEXT` / `QAFF_WEB_SMOKE_ITEM_SELECTOR` (what the smoke expects on the
first screen); `qaff doctor --project .` reports whether each target answers. To run the same
smoke offline against the bundled fixture instead: `QAFF_WEB_TARGET=fixture npm test`.

## Writing your first test

1. Add a page object under `apps/<id>/<layer>/pages/` extending `BasePage`
   and exposing `getByRole`/`getByTestId` locators.
2. Add a spec under `apps/<id>/<layer>/tests/` asserting with web-first
   assertions (`await expect(locator).toBeVisible()`).
3. `npm test`. The pretest `tsc --build` typechecks your code first.

Conventions, dependency-direction rules and AI-assistant guidance:
[AGENTS.md](AGENTS.md).

## Allure results and the local MCP server

The MCP Toolkit is enabled, so `npm test` also runs the `allure-playwright`
reporter, which writes raw results for every app and layer to
`allure-results/` (git-ignored). They feed
`qaff analyze-failures --project . --all-apps --all-layers` and the local MCP
server's `read_test_results` tool (`node .ai/mcp/server/server.js --self-test`
checks the server); each result is attributed to its app and layer by its spec
path (`<app-id>/<layer>/tests/…`).

## Allure HTML report

`ci.<provider>.allureReport` is on: `npm test` also writes raw
`allure-playwright` results to `allure-results/`, and the CI pipeline builds
an Allure HTML report from them after the tests (even when they fail) and keeps
it as the `allure-report` artifact. Locally:

```bash
npm run allure:report            # allure-results/ -> allure-report/
npx allure open allure-report
```

See [docs/HOW_TO_USE_ALLURE.md](docs/HOW_TO_USE_ALLURE.md).
