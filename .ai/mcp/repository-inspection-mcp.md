# MCP spec — repository-inspection

> **Status: compatibility spec.** Phase 4.0 includes a minimal local MCP
> server. Repository inspection has a minimal lock-file implementation;
> deeper npm workspace analysis remains future scope.

## Intended purpose

Answer structural questions about the generated repository so an
agent does not have to grep its way around:

- "Which apps and layers exist?"
- "What are framework-core's dependents?"
- "Does this PR violate the dependency direction?"

## Resources

| URI scheme | Returns |
| --- | --- |
| `repo://lockfile` | Parsed `qa-factory.lock.json`. |
| `repo://modules` | List of npm workspaces with kind (`framework-core`, `framework-web`, `framework-performance`, `app`). |
| `repo://app/<id>/layers` | Layers actually generated for one app. |

## Tools

### `check_dependency_direction`

Inputs:
- `from` (workspace package name).
- `to` (workspace package name).

Output: `{ allowed: boolean, rule: string, message?: string }`.
Rules mirror the generator's post-generation validator
(`framework-must-not-depend-on-apps`,
`framework-modules-must-stay-independent`,
`apps-must-not-depend-on-other-apps`).

### `describe_app`

Inputs:
- `app` (string id).

Output: `{ id, layers, packageBase, modules: [...] }`.

## Hard rules for the future implementation

- Read-only. Never modifies package.json files, source code or
  `qa-factory.lock.json`.
- Must not invent modules, layers or apps that are not present in
  `qa-factory.lock.json` and the on-disk module tree.
- Must reject paths outside the project root.
