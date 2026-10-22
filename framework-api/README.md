# framework-api

Shared support for API-level tests, built on Playwright's
[`APIRequestContext`](https://playwright.dev/docs/api-testing).

```
apps/<id>/api  ->  framework-api  ->  framework-core
```

- `resolveApiConfig(overrideBaseURL?)` — resolves the base URL and timeout from
  an explicit override, then `QAFF_API_BASE_URL` / `QAFF_API_TIMEOUT_SECONDS`,
  then local defaults.
- `createApiContext(overrideBaseURL?)` — opens an `APIRequestContext` for those
  settings.

The generated `apps/<id>/api` smoke test starts an in-process `node:http` stub
and drives it through `createApiContext`, so it runs fully offline — no deployed
service required. Point it at a real service by setting `QAFF_API_BASE_URL` (or
passing a base URL to `createApiContext`) and, when its health route is not `/health`,
`QAFF_API_HEALTH_PATH` (a GET path expected to answer 200).

## Dependency direction (do not break)

`framework-api` may depend on `framework-core` only. It must never import from
`apps/*` or `framework-web`.
