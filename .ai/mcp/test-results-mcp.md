# MCP spec — test-results

> **Status: compatibility spec.** The local MCP server implements the
> Allure half of this spec: `read_test_results` returns per-app,
> per-layer totals, failed tests with categories, failing step names and
> error excerpts (see `tools/read-test-results.tool.md`). Still
> unimplemented from the spec below: flakiness
> history across runs, and MCP resources.

## Intended purpose

Expose the allure-playwright results from the generated repository to
an agent over MCP, so prompts like *"summarise the last failed run"*
do not require shell access.

## Resources

| URI scheme | Returns |
| --- | --- |
| `results://allure/latest` | Path + summary of the most recent `allure-results/` directory. |
| `results://allure/history` | Pass/fail history per test, if `allure-report/history/` is present. |

## Tools

### `get_failed_tests`

Inputs:
- `module` (string, optional) — restrict to a single app layer (`apps/<id>/<layer>`).
- `since` (ISO timestamp, optional).

Output: array of `{ test, module, message, stackTrace, durationMs }`.

### `get_flaky_tests`

Inputs:
- `window` (integer, default 10) — number of recent runs to consider.

Output: array of `{ test, runs, fails, lastFail, lastPass }`. A test
is "flaky" only if it has both a pass and a fail inside the window
**against identical commit hashes**. The server must not flag a test
as flaky based on a single failure.

## Hard rules for the future implementation

- Read-only. Must never mutate test files, configuration or results.
- Must not contact the network. All inputs come from the local
  filesystem under the project root.
- Must reject paths outside the project root (no `..` traversal).
- Must not return invented test names or counts. If a results
  directory is missing, return an explicit error, not an empty
  success.
