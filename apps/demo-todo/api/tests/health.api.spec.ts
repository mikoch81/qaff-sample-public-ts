import { test, expect } from "@playwright/test";
import { createApiContext } from "@client-demo-public-ts-qa/framework-api";
import * as http from "node:http";
import type { AddressInfo } from "node:net";

// Offline by default: an in-process stub is started unless QAFF_API_BASE_URL
// points at a real service, in which case the same test runs against it;
// QAFF_API_HEALTH_PATH names the GET path expected to answer 200 (default /health).
const externalBaseURL = process.env.QAFF_API_BASE_URL;
const healthPath = process.env.QAFF_API_HEALTH_PATH ?? "/health";
let server: http.Server | undefined;
let baseURL: string;

test.beforeAll(async () => {
  if (externalBaseURL) {
    baseURL = externalBaseURL;
    return;
  }
  // A local const keeps the type narrowed inside the listen callback (strict mode).
  const stub = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === healthPath) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", app: "demo-todo" }));
      return;
    }
    res.writeHead(404).end();
  });
  server = stub;
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
  const { port } = stub.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  if (server) {
    const stub = server;
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  }
});

test.describe("Demo Todo — api smoke", () => {
  test("GET /health returns ok", async () => {
    const api = await createApiContext(baseURL);
    try {
      const response = await api.get(healthPath);
      expect(response.status()).toBe(200);
      await expect(response).toBeOK();
      if (!externalBaseURL) {
        expect(await response.json()).toEqual({ status: "ok", app: "demo-todo" });
      }
    } finally {
      await api.dispose();
    }
  });
});
