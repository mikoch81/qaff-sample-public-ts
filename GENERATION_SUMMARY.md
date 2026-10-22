# Generation Summary

`qaff create` produced a real, buildable TypeScript/npm/Playwright
framework from the inputs below.

## Inputs

- **Config:** `client-demo-public-ts.yaml`
- **Project:** `client-demo-public-ts-qa`
- **Node.js target:** `20`
- **Blueprint:** `ts-npm-playwright` v0.1.0

## Selected blueprint

- **id:** `ts-npm-playwright`
- **version:** 0.1.0
- **name:** TypeScript + npm + Playwright
- **maturity:** stable
- **description:** Web-automation blueprint for TypeScript projects. Generates an npm-workspaces multi-package framework with Playwright and a fixture-based smoke test. Targets Node.js 20 (default) with Node.js 22 as an option.
- **language:** typescript
- **buildTool:** npm
- **testRunner:** playwright
- **automationTools:** playwright
- **reportingTools:** playwright-html
- **supportedChannels:** web-desktop, web-mobile
- **supportedIntegrations:** github-actions, jenkins, azure-pipelines, gitlab-ci
- **supportedQualityPacks:** integration, api, performance
- **outputStructure:** package.json, playwright.config.ts, tsconfig.json, framework-core/, framework-web/, framework-api/, framework-performance/, apps/, qa-factory.lock.json
- **manifest path:** `ts-npm-playwright/blueprint.yaml`

## Applications

- `apps/demo-todo` — Demo Todo (TodoMVC)  (layers: web-desktop, web-mobile, api)

- **External web targets:** `demo-todo` → `https://demo.playwright.dev/todomvc` — the web smoke runs against these URLs, so the first `mvn verify` fails until they are reachable (replace a placeholder such as `https://example.invalid`; `qaff doctor --project .` probes them; see README "External web targets").

## Files written

```
package.json
playwright.config.ts
tsconfig.json
.gitignore
README.md
docs/HOW_TO_USE_ALLURE.md
.ai/mcp/README.md
.ai/mcp/mcp-config.example.json
.ai/mcp/server.manifest.json
.ai/mcp/server/server.js
.ai/mcp/tools/read-test-results.tool.md
.ai/mcp/tools/compare-performance-baseline.tool.md
.ai/mcp/tools/attach-report-to-jira.tool.md
.ai/mcp/tools/create-zephyr-execution.tool.md
.ai/mcp/tools/sync-xray-results.tool.md
.ai/mcp/tools/sync-testrail-results.tool.md
.ai/mcp/tools/inspect-repository-structure.tool.md
.ai/mcp/tools/suggest-test-implementation.tool.md
.ai/mcp/test-results-mcp.md
.ai/mcp/performance-results-mcp.md
.ai/mcp/repository-inspection-mcp.md
AGENTS.md
CLAUDE.md
.github/workflows/playwright.yml
framework-core/package.json
framework-core/tsconfig.json
framework-core/src/index.ts
framework-core/src/helpers/waitHelper.ts
framework-web/package.json
framework-web/tsconfig.json
framework-web/src/index.ts
framework-web/src/BasePage.ts
framework-web/src/PageComponent.ts
framework-api/package.json
framework-api/tsconfig.json
framework-api/src/index.ts
framework-api/src/ApiTestSupport.ts
framework-api/README.md
framework-performance/README.md
framework-performance/thresholds.yaml
framework-performance/baseline/README.md
framework-performance/reports/README.md
framework-performance/reports/history/README.md
framework-performance/providers/k6/README.md
framework-performance/providers/k6/input/README.md
scripts/run-k6-import-smoke.ps1
scripts/run-k6-import-smoke.sh
docs/performance-strategy.md
docs/quality-gates.md
apps/demo-todo/web-desktop/package.json
apps/demo-todo/web-desktop/tsconfig.json
apps/demo-todo/web-desktop/pages/DemoTodoHomePage.ts
apps/demo-todo/web-desktop/tests/smoke.spec.ts
apps/demo-todo/web-mobile/package.json
apps/demo-todo/web-mobile/tsconfig.json
apps/demo-todo/web-mobile/pages/DemoTodoMobileHomePage.ts
apps/demo-todo/web-mobile/tests/smoke.spec.ts
apps/demo-todo/api/package.json
apps/demo-todo/api/tsconfig.json
apps/demo-todo/api/tests/health.api.spec.ts
qa-factory.lock.json
GENERATION_SUMMARY.md
```

## Post-generation validation

- **Dependency direction:** PASSED
- **Modules checked:** 6
- **Rule:** `apps/* -> framework-*` allowed; `framework-* -> apps/*` forbidden.

## Build it

```bash
npm test
```
