# MCP tool — inspect_repository_structure

## Purpose

Read `qa-factory.lock.json` and summarize generated apps, layers,
pack flags and CI metadata for agents.

## Inputs

- `path` — optional path under the project root, validated for path traversal
  (the summary itself always comes from the root lock file).

## Outputs

- `status` — `OK` or `ERROR`.
- `project`, `packs`, `ci`, `apps`.
- `blueprintId` — the generating blueprint from the lock (for example
  `ts-npm-playwright`).

## Side effects

None. The tool is read-only.
