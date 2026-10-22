# AGENTS.md

Guidance for AI coding assistants (and human contributors) working in
**client-demo-public-ts-qa** — a generated, **owned** QA automation framework built on
**TypeScript + Playwright** with npm workspaces. This file is the vendor-neutral
entry point that many agents load automatically; [CLAUDE.md](CLAUDE.md) points here.

You own this code. Edit it freely — the project runs on its own, with no dependency
on the generator that produced it.

## What this is

An npm-workspaces monorepo: TypeScript + `@playwright/test`. Open it in VS Code and
write your own end-to-end tests. Build the framework packages, then run the suite:

```bash
npm install
npx playwright install
npm test
```

## Module map

- `framework-core` — shared helpers (e.g. `waitForCondition`).
- `framework-web` — the `BasePage` base class all page objects extend.
- `apps/<id>/<layer>` — one package per application and layer (list the
  `apps/` directory for the current set; it is the source of truth).

Each app holds `pages/*.ts` (page objects), `tests/*.spec.ts` (Playwright specs),
and `fixtures/*.html` (the bundled offline test target).

## Dependency direction (do not break)

- `apps/* → framework-*` is **allowed**.
- `framework-* → apps/*` is **forbidden**.
- `framework-core → framework-web` is **forbidden**.
- Cross-app dependencies (`apps/a → apps/b`) are **forbidden**.

## How to add a test or page object

- Add a page object under `apps/<id>/web-desktop/pages/`, extending `BasePage` from
  `@client-demo-public-ts-qa/framework-web`.
- Add a spec under `apps/<id>/web-desktop/tests/` as `<Name>.spec.ts` using
  `import { test, expect } from "@playwright/test"`.
- Study the generated `smoke.spec.ts` and `*HomePage.ts` beside your test code.
- If the `qaff` CLI is available, `qaff scaffold-test` / `qaff scaffold-page` /
  `qaff scaffold-component` generate stubs in the right place (all support
  `--layer web-mobile`).

## Conventions to preserve

- Use the Page Object Model; keep specs readable.
- Prefer Playwright's web-first assertions and auto-waiting over fixed timeouts —
  never hard-code `waitForTimeout` as a substitute for a real condition.
- **Selectors must come from real evidence** (the fixture HTML, page source, existing
  page objects) — never invent them.
- Keep smoke tests offline against the bundled `file://` fixture unless explicitly
  targeting a real application.

## Before you commit

- Run `qaff verify --project .` (structural health) and `npm test` (Playwright suite).
