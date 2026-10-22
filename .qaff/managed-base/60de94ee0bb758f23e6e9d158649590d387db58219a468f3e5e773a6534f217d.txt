/**
 * Polls until the given condition returns true or the timeout is reached.
 * Throws if the condition is not satisfied within the timeout.
 *
 * Use this only for conditions Playwright cannot await natively (an external
 * system converging, a file appearing, a non-DOM value). For anything visible
 * on the page, prefer web-first assertions — e.g.
 * `await expect(locator).toBeVisible()` or `await expect.poll(...)` — which
 * retry automatically and produce far better failure output.
 *
 * Deliberately framework-agnostic: framework-core must not depend on the
 * Playwright test package (and never poll via the page's fixed-timeout wait).
 */
export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 200;
  const start = Date.now();
  while (true) {
    if (await condition()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForCondition timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
