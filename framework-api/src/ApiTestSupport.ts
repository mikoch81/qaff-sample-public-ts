import { request, type APIRequestContext } from "@playwright/test";

/**
 * Resolved configuration for an API test context. Values come from the
 * environment so the same specs can target a local stub or a real service
 * without code changes.
 */
export interface ApiConfig {
  baseURL: string;
  timeoutMs: number;
}

/**
 * Resolves the API base URL and timeout. Precedence:
 *   1. an explicit override passed by the caller (e.g. a test's in-process stub),
 *   2. the QAFF_API_BASE_URL / QAFF_API_TIMEOUT_SECONDS environment variables,
 *   3. the local defaults (http://localhost:8080, 10s).
 */
export function resolveApiConfig(overrideBaseURL?: string): ApiConfig {
  const baseURL = overrideBaseURL ?? process.env.QAFF_API_BASE_URL ?? "http://localhost:8080";
  const timeoutSeconds = Number(process.env.QAFF_API_TIMEOUT_SECONDS ?? "10");
  const timeoutMs =
    Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 10_000;
  return { baseURL, timeoutMs };
}

/**
 * Opens a Playwright APIRequestContext bound to the resolved base URL. Dispose
 * it with `await context.dispose()` when the test finishes.
 */
export async function createApiContext(overrideBaseURL?: string): Promise<APIRequestContext> {
  const config = resolveApiConfig(overrideBaseURL);
  return request.newContext({ baseURL: config.baseURL, timeout: config.timeoutMs });
}
