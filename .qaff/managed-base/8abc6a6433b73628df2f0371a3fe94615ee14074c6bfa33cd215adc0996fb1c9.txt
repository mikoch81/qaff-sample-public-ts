# CLAUDE.md

Guidance for Claude Code working in this generated TypeScript/Playwright QA
framework. **[AGENTS.md](AGENTS.md) is the authoritative entry point** — read it
first. This file restates only the rules that are easiest to get wrong.

## Non-negotiable rules

- **Dependency direction:** `apps/* → framework-*` only. Never `framework-* → apps/*`,
  never `framework-core → framework-web`, never app-to-app.
- **Never invent selectors, URLs, or credentials.** Use selectors backed by real
  evidence (fixture HTML, page source, existing page objects).
- **Keep smoke tests offline** against the bundled `file://` fixture unless the task
  explicitly targets a real application.
- **Prefer Playwright auto-waiting and web-first assertions** over fixed timeouts.

## Where to look

- Conventions, module map, how to add a test → [AGENTS.md](AGENTS.md).
- The generated `smoke.spec.ts` and `*HomePage.ts` are your working examples.

## Before you finish

Run `qaff verify --project .` and `npm test`.
