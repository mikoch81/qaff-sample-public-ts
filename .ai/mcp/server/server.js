#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const SERVER_VERSION = "0.3.0";

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: "read_test_results",
    title: "Read test results",
    description: "Summarize local Allure results per app and layer: totals, failed tests with categories, failing steps and error excerpts. Read-only; it never runs tests.",
    inputSchema: { type: "object", properties: { runRef: { type: "string" }, app: { type: "string" }, layer: { type: "string" } }, additionalProperties: false },
    annotations: READ_ONLY_LOCAL,
  },
  {
    name: "compare_performance_baseline",
    title: "Compare performance baseline",
    description: "Evaluate a normalized performance result against framework-performance/thresholds.yaml and the stored baseline. Read-only and advisory: it never gates a build and never updates a baseline.",
    inputSchema: { type: "object", properties: { runRef: { type: "string" }, app: { type: "string" }, scenario: { type: "string" }, baselineRef: { type: "string" }, thresholdsRef: { type: "string" } }, additionalProperties: false },
    annotations: READ_ONLY_LOCAL,
  },
  {
    name: "attach_report_to_jira",
    title: "Attach report to Jira",
    description: "Summarize local Allure results as one Jira comment (the same body as qaff sync-test-results --provider jira-comment). Default behavior writes a local dry-run artifact; a live comment requires JIRA_ENABLE_LIVE_WRITE=true plus JIRA_BASE_URL / JIRA_USER / JIRA_TOKEN. Never creates issues.",
    inputSchema: { type: "object", properties: { issueKey: { type: "string" }, app: { type: "string" }, layer: { type: "string" }, runRef: { type: "string" }, runUrl: { type: "string" }, reportUrl: { type: "string" }, comment: { type: "string" } }, required: ["issueKey"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "create_zephyr_execution",
    title: "Create Zephyr execution",
    description: "Create Zephyr executions. Default behavior writes a local dry-run artifact; optional live write requires explicit opt-in.",
    inputSchema: { type: "object", properties: { projectKey: { type: "string" }, cycleKey: { type: "string" }, executions: { type: "array" } }, required: ["projectKey", "executions"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "sync_xray_results",
    title: "Sync Xray results",
    description: "Import test results into Xray Cloud (the same JSON import body as qaff sync-test-results --provider xray-cloud) for an existing project or Test Execution. Default behavior writes a local dry-run artifact; a live import requires XRAY_ENABLE_LIVE_WRITE=true plus XRAY_CLIENT_ID / XRAY_CLIENT_SECRET. Never creates test cases.",
    inputSchema: { type: "object", properties: { projectKey: { type: "string" }, testExecKey: { type: "string" }, app: { type: "string" }, executions: { type: "array" } }, required: ["projectKey", "executions"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "sync_testrail_results",
    title: "Sync TestRail results",
    description: "Add test results to an existing TestRail run (the same add_results_for_cases body as qaff sync-test-results --provider testrail). Default behavior writes a local dry-run artifact; a live write requires TESTRAIL_ENABLE_LIVE_WRITE=true plus TESTRAIL_URL / TESTRAIL_USER / TESTRAIL_API_KEY. Never creates cases or runs.",
    inputSchema: { type: "object", properties: { runId: { type: ["integer", "string"] }, app: { type: "string" }, executions: { type: "array" } }, required: ["runId", "executions"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "inspect_repository_structure",
    title: "Inspect repository structure",
    description: "Read qa-factory.lock.json and summarize generated apps, layers, packs and CI metadata.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false },
    annotations: READ_ONLY_LOCAL,
  },
  {
    name: "suggest_test_implementation",
    title: "Suggest test implementation",
    description: "Turn AI-authoring contracts into a deterministic implementation plan: readiness verdict, target module/package/class, steps with Allure mapping, page objects and which agent and prompt to use. Never writes files and never emits code.",
    inputSchema: { type: "object", properties: { app: { type: "string" }, layer: { type: "string" }, requirement: { type: "string" }, examples: { type: "array", items: { type: "string" } }, scenarioContract: { type: "object" }, scenarioContractRef: { type: "string" }, testAuthoringRequest: { type: "object" }, testAuthoringRequestRef: { type: "string" }, locatorEvidence: { type: "object" }, locatorEvidenceRef: { type: "string" }, allureStepMapping: { type: "object" }, allureStepMappingRef: { type: "string" } }, additionalProperties: false },
    annotations: READ_ONLY_LOCAL,
  },
];

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

function repoRoot() {
  return path.resolve(process.env.QAFF_REPO_ROOT || process.cwd());
}

function safeResolve(root, candidate) {
  const target = path.resolve(root, candidate || ".");
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path is outside the project root.");
  }
  return target;
}

function textPayload(payload, isError) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: isError === true,
  };
}

// Credentials pasted as CI secrets often carry a trailing newline or one pair of surrounding
// quotes; trim, strip that pair, trim again, and treat empty as unset.
function envValue(name) {
  const value = String(process.env[name] || "").trim();
  const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]);
  return quoted ? value.slice(1, -1).trim() : value;
}

function missingEnv(names) {
  return names.filter((name) => !envValue(name));
}

function envTrue(name) {
  const value = process.env[name];
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

// Port of generator/src/integrations/zephyrScaleCloud.ts (buildZephyrScaleCloudEndpoint,
// buildZephyrExecutionRequest): Zephyr Scale Cloud takes ONE execution per
// POST /v2/testexecutions, with the same field order as the qaff CLI.
function buildZephyrScaleCloudEndpoint(baseUrl) {
  let normalized = String(baseUrl).trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  // Accept the documented ".../v2" form (and the full endpoint) so neither doubles the path.
  for (const suffix of ["/v2/testexecutions", "/v2"]) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized + "/v2/testexecutions";
}

function buildZephyrExecutionRequest(payload, execution) {
  return {
    projectKey: payload.projectKey,
    testCaseKey: execution.testCaseKey,
    ...(payload.cycleKey ? { testCycleKey: payload.cycleKey } : {}),
    statusName: execution.status,
    executionTime: execution.executionTime ?? 0,
    comment: execution.comment,
  };
}

// Tool input executions use testCaseKey (CLI name) or testKey (documented MCP alias).
function zephyrRequestsFromArgs(args) {
  const executions = Array.isArray(args && args.executions) ? args.executions : [];
  return executions.map((entry) => {
    const execution = entry || {};
    return buildZephyrExecutionRequest(
      { projectKey: args.projectKey, cycleKey: args.cycleKey },
      {
        testCaseKey: execution.testCaseKey ?? execution.testKey,
        status: execution.status,
        executionTime: execution.executionTime,
        comment: execution.comment,
      },
    );
  });
}

// The CLI mapper only emits executions with a case key and a status, so reject any
// other entry up front — before any POST, so a re-run never duplicates earlier writes.
function zephyrInvalidExecutionIndexes(args) {
  const executions = Array.isArray(args && args.executions) ? args.executions : [];
  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
  const invalid = [];
  executions.forEach((entry, index) => {
    const execution = entry || {};
    if (!nonEmpty(execution.testCaseKey ?? execution.testKey) || !nonEmpty(execution.status)) {
      invalid.push(index);
    }
  });
  return invalid;
}

function writeZephyrDryRun(root, args) {
  const outDir = path.join(root, ".ai", "mcp", "outbox");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "zephyr-execution.request.json");
  const payload = {
    tool: "create_zephyr_execution",
    mode: "dry-run",
    request: args || {},
    requests: zephyrRequestsFromArgs(args || {}),
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return path.relative(root, outPath).split(path.sep).join("/");
}

// Port of generator/src/integrations/jiraComment.ts (buildJiraCommentEndpoint,
// buildJiraCommentBody): the same Jira Cloud ADF comment qaff sync-test-results
// --provider jira-comment posts to POST /rest/api/3/issue/<key>/comment.
function buildJiraCommentEndpoint(baseUrl, issueKey) {
  let normalized = String(baseUrl).trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized + "/rest/api/3/issue/" + encodeURIComponent(issueKey) + "/comment";
}

function buildJiraCommentBody(input) {
  const t = input.totals;
  const verdict = t.failed + t.broken > 0 ? "FAILED" : t.total === 0 ? "NO RESULTS" : "PASSED";
  const scope = [input.project, input.app].filter((part) => typeof part === "string" && part.length > 0).join(" / ");
  const text = (value, marks) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });
  const link = (label, href) => text(label, [{ type: "link", attrs: { href } }]);
  const content = [
    {
      type: "paragraph",
      content: [text("qaff test results", [{ type: "strong" }]), text(": " + verdict + (scope ? " (" + scope + ")" : ""))],
    },
    {
      type: "paragraph",
      content: [text("Total " + t.total + " — passed " + t.passed + ", failed " + t.failed + ", broken " + t.broken + ", skipped " + t.skipped + ".")],
    },
  ];
  const links = [];
  if (input.runUrl) links.push(link("CI run", input.runUrl));
  if (input.reportUrl) {
    if (links.length > 0) links.push(text(" · "));
    links.push(link("Test report", input.reportUrl));
  }
  if (links.length > 0) content.push({ type: "paragraph", content: links });
  if (input.note) content.push({ type: "paragraph", content: [text(input.note)] });
  return { body: { type: "doc", version: 1, content } };
}

// Port of generator/src/integrations/testManagement.ts (buildXrayImportRequest,
// buildTestRailResultsRequest, buildTestRailEndpoint): the same request bodies
// qaff sync-test-results --provider xray-cloud / testrail sends. Tool input
// executions replace the CLI's Allure mapper: { caseKey, status, comment } with
// Allure statuses (passed / failed / broken / skipped / unknown).
const XRAY_DEFAULT_BASE_URL = "https://xray.cloud.getxray.app";
const RESULT_STATUSES = ["passed", "failed", "broken", "skipped", "unknown"];

function trimTrailingSlashes(value) {
  let normalized = String(value).trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function buildXrayImportRequest(mapped, options) {
  return {
    ...(options.testExecKey ? { testExecutionKey: options.testExecKey } : {}),
    info: {
      project: options.projectKey,
      summary: "qaff Allure results: " + options.scope,
      description: "Imported by qaff sync-test-results from local Allure results.",
    },
    tests: mapped.executions.map((execution) => ({
      testKey: execution.caseKey,
      status: execution.status === "passed" ? "PASSED" : execution.status === "failed" || execution.status === "broken" ? "FAILED" : "TODO",
      comment: execution.comment,
    })),
  };
}

function buildTestRailResultsRequest(mapped) {
  const results = [];
  const invalidKeys = [];
  let notRun = 0;
  for (const execution of mapped.executions) {
    const match = /^C?(\d+)$/i.exec(execution.caseKey);
    if (!match) {
      invalidKeys.push(execution.caseKey);
      continue;
    }
    if (execution.status !== "passed" && execution.status !== "failed" && execution.status !== "broken") {
      notRun += 1;
      continue;
    }
    results.push({ case_id: Number(match[1]), status_id: execution.status === "passed" ? 1 : 5, comment: execution.comment });
  }
  const warnings = [];
  if (invalidKeys.length > 0) warnings.push(invalidKeys.length + " case key(s) are not TestRail case ids (C<number>) and were left out.");
  if (notRun > 0) warnings.push(notRun + " skipped / unknown test(s) were left out: TestRail does not accept status_id 3 (Untested) on add_results_for_cases.");
  return { request: { results }, invalidKeys, warnings };
}

function buildTestRailEndpoint(baseUrl, runId) {
  return trimTrailingSlashes(baseUrl) + "/index.php?/api/v2/add_results_for_cases/" + runId;
}

// keyFields: accepted names for the case key, first match wins (caseKey is the CLI name).
function executionKey(execution, keyFields) {
  return keyFields.map((field) => execution[field]).find((value) => value !== undefined);
}

function mappedFromArgs(args, keyFields) {
  const executions = Array.isArray(args && args.executions) ? args.executions : [];
  return {
    executions: executions.map((entry) => {
      const execution = entry || {};
      return { caseKey: String(executionKey(execution, keyFields)), status: execution.status, comment: execution.comment };
    }),
  };
}

// Reject bad entries before any write or POST (same rule as create_zephyr_execution).
function resultInvalidExecutionIndexes(args, keyFields) {
  const executions = Array.isArray(args && args.executions) ? args.executions : [];
  const invalid = [];
  executions.forEach((entry, index) => {
    const execution = entry || {};
    const key = executionKey(execution, keyFields);
    const keyOk = (typeof key === "string" && key.trim().length > 0) || (typeof key === "number" && Number.isInteger(key) && key > 0);
    const commentOk = execution.comment === undefined || typeof execution.comment === "string";
    if (!keyOk || !RESULT_STATUSES.includes(execution.status) || !commentOk) {
      invalid.push(index);
    }
  });
  return invalid;
}

// Live-mode env check mirroring the CLI: a set-but-non-http(s) URL counts as missing.
function missingLiveEnv(names) {
  const urlVars = ["XRAY_BASE_URL", "TESTRAIL_URL"];
  return names.filter((name) => !envValue(name) || (urlVars.includes(name) && !/^https?:\/\/\S+$/i.test(envValue(name))));
}

function writeOutbox(root, fileName, payload) {
  const outDir = path.join(root, ".ai", "mcp", "outbox");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return path.relative(root, outPath).split(path.sep).join("/");
}

async function postJson(url, headers, body) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function readLock(root) {
  const lockPath = path.join(root, "qa-factory.lock.json");
  if (!fs.existsSync(lockPath)) {
    return { ok: false, path: lockPath, message: "qa-factory.lock.json was not found." };
  }
  try {
    return { ok: true, path: lockPath, data: JSON.parse(fs.readFileSync(lockPath, "utf8")) };
  } catch (error) {
    return { ok: false, path: lockPath, message: error instanceof Error ? error.message : String(error) };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────
// Used by every real tool below. Keep them dependency-free: the generated
// server must run on a bare Node install inside the generated repository.

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// Every path in a tool payload is repo-relative POSIX so responses stay
// identical across machines (the generator's determinism rule applies to the
// runtime's output too).
function relPath(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch (error) {
    return false;
  }
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch (error) {
    return false;
  }
}

function readJsonFile(candidate) {
  return JSON.parse(fs.readFileSync(candidate, "utf8"));
}

function getNumericMetric(metrics, segments) {
  let current = metrics;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return null;
    }
    current = current[segment];
  }
  return toFiniteNumber(current);
}

// ── thresholds.yaml — deterministic subset reader ─────────────────────────
// The generated server has no npm dependencies, so it cannot use the YAML
// parser the generator uses. It reads the documented subset instead: block
// mappings indented in multiples of two spaces, scalar values, and comments.
// Anything outside that subset is an explicit error with a CLI hint — never a
// silent NOT_EVALUATED, which would misreport a real threshold model.

const YAML_SUBSET_HINT =
  "thresholds.yaml uses YAML features outside the MCP subset (2-space block mappings, scalars and # comments only). Run `qaff evaluate-quality-impact --project .` for the full evaluator.";

function yamlSubsetError() {
  const error = new Error(YAML_SUBSET_HINT);
  error.qaffYamlSubset = true;
  return error;
}

function stripYamlComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || line[index - 1] === " " || line[index - 1] === "\t")) {
      return line.slice(0, index);
    }
  }
  return line;
}

function findKeyColon(body) {
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ":" && (index + 1 === body.length || body[index + 1] === " ")) {
      return index;
    }
  }
  return -1;
}

function parseYamlScalar(raw) {
  const text = raw.trim();
  if (text.length === 0 || text === "~" || text === "null") {
    return null;
  }
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  const first = text[0];
  if (first === "{" || first === "[" || first === "&" || first === "*" || first === "|" || first === ">") {
    throw yamlSubsetError();
  }
  if ((first === '"' && text.endsWith('"')) || (first === "'" && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/.test(text)) {
    return Number(text);
  }
  return text;
}

function parseYamlSubset(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = String(text).split(/\r?\n/);

  for (const rawLine of lines) {
    if (rawLine.indexOf("\t") >= 0) {
      throw yamlSubsetError();
    }
    const line = stripYamlComment(rawLine);
    if (line.trim().length === 0) {
      continue;
    }
    const indent = line.length - line.replace(/^ +/, "").length;
    const body = line.trim();
    if (indent % 2 !== 0 || body === "---" || body === "..." || body.startsWith("- ") || body === "-") {
      throw yamlSubsetError();
    }
    const colon = findKeyColon(body);
    if (colon < 0) {
      throw yamlSubsetError();
    }
    const key = body.slice(0, colon).trim();
    if (key.length === 0 || key[0] === "&" || key[0] === "*" || key[0] === "?") {
      throw yamlSubsetError();
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].value;
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      throw yamlSubsetError();
    }
    const rest = body.slice(colon + 1).trim();
    if (rest.length === 0) {
      const child = {};
      parent[key] = child;
      stack.push({ indent: indent, value: child });
      continue;
    }
    parent[key] = parseYamlScalar(rest);
  }

  return root;
}

// ── Quality Impact evaluation (port) ──────────────────────────────────────
// Literal port of generator/src/qualityImpact/thresholdEvaluator.ts and
// generator/src/qualityImpact/baselineComparator.ts. Verdict names, finding
// messages, field order and sort order must stay identical on both sides:
// generator/test/mcpComparePerformanceBaseline.test.cjs asserts deepEqual
// against those modules. Never "improve" one side alone.

const QI_SUPPORTED_METRIC_ROOTS = ["responseTime", "errorRate", "throughput", "sample"];

const QI_BASELINE_METRICS = [
  { metric: "metrics.responseTime.p50Ms", baselineKey: "p50_response_ms", resultPath: ["responseTime", "p50Ms"], direction: "higher-is-worse" },
  { metric: "metrics.responseTime.p95Ms", baselineKey: "p95_response_ms", resultPath: ["responseTime", "p95Ms"], direction: "higher-is-worse" },
  { metric: "metrics.responseTime.p99Ms", baselineKey: "p99_response_ms", resultPath: ["responseTime", "p99Ms"], direction: "higher-is-worse" },
  { metric: "metrics.errorRate.percent", baselineKey: "error_rate_pct", resultPath: ["errorRate", "percent"], direction: "higher-is-worse" },
  { metric: "metrics.throughput.requestsPerSecond", baselineKey: "throughput_rps", resultPath: ["throughput", "requestsPerSecond"], direction: "lower-is-worse" },
];

function qiStringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

// The two generator modules each carry their own copy of this validator; the
// only difference is the error prefix, so the port takes it as an argument.
function validatePerformanceResult(input, who) {
  if (!isRecord(input)) {
    throw new Error(who + ": performance result must be an object.");
  }
  if (typeof input.$schema !== "string" || input.$schema.length === 0) {
    throw new Error(who + ": performance result $schema must be a non-empty string.");
  }
  if (typeof input.app !== "string" || input.app.length === 0) {
    throw new Error(who + ": performance result app must be a non-empty string.");
  }
  if (typeof input.scenario !== "string" || input.scenario.length === 0) {
    throw new Error(who + ": performance result scenario must be a non-empty string.");
  }
  if (typeof input.level !== "string" || input.level.length === 0) {
    throw new Error(who + ": performance result level must be a non-empty string.");
  }
  if (!isRecord(input.metrics)) {
    throw new Error(who + ": performance result metrics must be an object.");
  }
  return {
    $schema: input.$schema,
    app: input.app,
    scenario: input.scenario,
    level: input.level,
    metrics: input.metrics,
    valid: typeof input.valid === "boolean" ? input.valid : undefined,
    warnings: qiStringList(input.warnings),
    notes: qiStringList(input.notes),
  };
}

function validateThresholdModel(input) {
  if (!isRecord(input)) {
    throw new Error("thresholdEvaluator: thresholds model must be an object.");
  }
  if (typeof input.version !== "number") {
    throw new Error("thresholdEvaluator: thresholds.version must be a number.");
  }
  if (typeof input.status !== "string" || input.status.length === 0) {
    throw new Error("thresholdEvaluator: thresholds.status must be a non-empty string.");
  }
  if (typeof input.enforcement !== "string" || input.enforcement.length === 0) {
    throw new Error("thresholdEvaluator: thresholds.enforcement must be a non-empty string.");
  }
  return {
    version: input.version,
    status: input.status,
    enforcement: input.enforcement,
    appliesTo: typeof input.appliesTo === "string" ? input.appliesTo : undefined,
    defaults: isRecord(input.defaults) ? input.defaults : undefined,
    apps: isRecord(input.apps) ? input.apps : undefined,
  };
}

function thresholdBaseReport(model, result, verdict, findings, warnings, notes) {
  return {
    $schema: "qaff/threshold-evaluation/v1",
    status: "advisory",
    enforcement: "none",
    app: result.app,
    scenario: result.scenario,
    level: result.level,
    thresholdsVersion: model.version,
    verdict: verdict,
    findings: findings,
    warnings: warnings,
    notes: notes,
  };
}

function isThresholdLeaf(value) {
  return isRecord(value)
    && ((typeof value.max === "number" && Number.isFinite(value.max))
      || (typeof value.min === "number" && Number.isFinite(value.min)));
}

function mergeThresholdNodes(base, override) {
  const baseRecord = isRecord(base) ? base : {};
  const overrideRecord = isRecord(override) ? override : {};
  const merged = {};
  const keys = [...new Set([...Object.keys(baseRecord), ...Object.keys(overrideRecord)])].sort();
  for (const key of keys) {
    const baseValue = baseRecord[key];
    const overrideValue = overrideRecord[key];
    if (isThresholdLeaf(overrideValue)) {
      merged[key] = Object.assign({}, overrideValue);
      continue;
    }
    if (isThresholdLeaf(baseValue) && overrideValue === undefined) {
      merged[key] = Object.assign({}, baseValue);
      continue;
    }
    if (isRecord(baseValue) || isRecord(overrideValue)) {
      merged[key] = mergeThresholdNodes(baseValue, overrideValue);
      continue;
    }
    if (typeof overrideValue === "string") {
      merged[key] = overrideValue;
      continue;
    }
    if (typeof baseValue === "string") {
      merged[key] = baseValue;
    }
  }
  return merged;
}

function effectiveLevelConfig(model, appId, level) {
  const defaults = model.defaults ? model.defaults[level] : undefined;
  const appOverrides = model.apps && isRecord(model.apps[appId]) ? model.apps[appId] : undefined;
  const override = appOverrides ? appOverrides[level] : undefined;
  if (!defaults && !override) {
    return null;
  }
  return {
    metrics: mergeThresholdNodes(
      isRecord(defaults) && isRecord(defaults.metrics) ? defaults.metrics : {},
      isRecord(override) && isRecord(override.metrics) ? override.metrics : {}
    ),
  };
}

function collectThresholdChecks(node, parents) {
  const checks = [];
  const entries = Object.entries(node).sort((left, right) => left[0].localeCompare(right[0]));
  for (const entry of entries) {
    const key = entry[0];
    const value = entry[1];
    if (key === "description") {
      continue;
    }
    if (isThresholdLeaf(value)) {
      if (typeof value.max === "number") {
        checks.push({ path: parents.concat([key]), operator: "max", threshold: value.max });
      }
      if (typeof value.min === "number") {
        checks.push({ path: parents.concat([key]), operator: "min", threshold: value.min });
      }
      continue;
    }
    if (isRecord(value)) {
      for (const nested of collectThresholdChecks(value, parents.concat([key]))) {
        checks.push(nested);
      }
    }
  }
  return checks;
}

function evaluateThresholdModel(thresholds, result) {
  const model = validateThresholdModel(thresholds);
  const normalizedResult = validatePerformanceResult(result, "thresholdEvaluator");
  const warnings = normalizedResult.warnings.slice();
  const notes = normalizedResult.notes.slice();

  if (normalizedResult.$schema !== "qaff/performance-result/v1") {
    warnings.push("Unsupported result schema: " + normalizedResult.$schema);
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (model.version !== 1) {
    warnings.push("Unsupported thresholds version: " + String(model.version));
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (model.status !== "advisory") {
    warnings.push("Unsupported thresholds status: " + model.status);
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (model.enforcement !== "none") {
    warnings.push("Unsupported thresholds enforcement: " + model.enforcement);
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (model.appliesTo !== undefined && model.appliesTo !== "provider-neutral") {
    warnings.push("Unsupported thresholds appliesTo: " + model.appliesTo);
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }

  const levelConfig = effectiveLevelConfig(model, normalizedResult.app, normalizedResult.level);
  if (!levelConfig || !isRecord(levelConfig.metrics)) {
    warnings.push("No supported threshold section for level '" + normalizedResult.level + "'.");
    return thresholdBaseReport(model, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }

  const checks = collectThresholdChecks(levelConfig.metrics, []);
  const findings = [];
  let hasUnsupportedThresholds = false;
  let hasMissingData = normalizedResult.valid === false;
  let hasFailures = false;

  if (normalizedResult.valid === false) {
    warnings.push("Performance result marked valid=false; treating evaluation as insufficient data.");
  }

  for (const check of checks) {
    const metricPath = "metrics." + check.path.join(".");
    if (QI_SUPPORTED_METRIC_ROOTS.indexOf(check.path[0]) < 0) {
      hasUnsupportedThresholds = true;
      findings.push({
        metric: metricPath,
        actual: null,
        operator: check.operator,
        threshold: check.threshold,
        passed: null,
        severity: "info",
        message: "Unsupported threshold metric for Phase 3.9 prototype: " + metricPath,
      });
      continue;
    }
    const actual = getNumericMetric(normalizedResult.metrics, check.path);
    if (actual === null) {
      hasMissingData = true;
      findings.push({
        metric: metricPath,
        actual: null,
        operator: check.operator,
        threshold: check.threshold,
        passed: null,
        severity: "warning",
        message: "Missing numeric metric: " + metricPath,
      });
      continue;
    }
    const passed = check.operator === "max" ? actual <= check.threshold : actual >= check.threshold;
    if (!passed) {
      hasFailures = true;
    }
    findings.push({
      metric: metricPath,
      actual: actual,
      operator: check.operator,
      threshold: check.threshold,
      passed: passed,
      severity: passed ? "info" : "warning",
      message: passed
        ? metricPath + " is within advisory threshold."
        : metricPath + " is outside advisory threshold.",
    });
  }

  const verdict = hasUnsupportedThresholds
    ? "NOT_EVALUATED"
    : hasMissingData
      ? "INSUFFICIENT_DATA"
      : hasFailures
        ? "OVER_THRESHOLD"
        : "PASS";

  return thresholdBaseReport(model, normalizedResult, verdict, findings, warnings, notes);
}

function validateBaselineModel(input) {
  if (!isRecord(input)) {
    throw new Error("baselineComparator: baseline model must be an object.");
  }
  if (typeof input.$schema !== "string" || input.$schema.length === 0) {
    throw new Error("baselineComparator: baseline $schema must be a non-empty string.");
  }
  if (typeof input.app !== "string" || input.app.length === 0) {
    throw new Error("baselineComparator: baseline app must be a non-empty string.");
  }
  if (!isRecord(input.scenarios)) {
    throw new Error("baselineComparator: baseline scenarios must be an object.");
  }
  return {
    $schema: input.$schema,
    app: input.app,
    capturedAt: typeof input.capturedAt === "string" ? input.capturedAt : undefined,
    scenarios: input.scenarios,
  };
}

function baselineBaseReport(baseline, result, verdict, findings, warnings, notes) {
  return {
    $schema: "qaff/baseline-comparison/v1",
    status: "advisory",
    enforcement: "none",
    app: result.app,
    scenario: result.scenario,
    level: result.level,
    baselineSchema: baseline.$schema,
    baselineCapturedAt: baseline.capturedAt === undefined ? null : baseline.capturedAt,
    verdict: verdict,
    findings: findings,
    warnings: warnings,
    notes: notes,
  };
}

function evaluateBaselineModel(baseline, result) {
  const normalizedBaseline = validateBaselineModel(baseline);
  const normalizedResult = validatePerformanceResult(result, "baselineComparator");
  const warnings = normalizedResult.warnings.slice();
  const notes = normalizedResult.notes.slice();

  if (normalizedResult.$schema !== "qaff/performance-result/v1") {
    warnings.push("Unsupported result schema: " + normalizedResult.$schema);
    return baselineBaseReport(normalizedBaseline, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (normalizedBaseline.$schema !== "qaff/performance-baseline/v1") {
    warnings.push("Unsupported baseline schema: " + normalizedBaseline.$schema);
    return baselineBaseReport(normalizedBaseline, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }
  if (normalizedBaseline.app !== normalizedResult.app) {
    warnings.push(
      "Baseline app '" + normalizedBaseline.app + "' does not match result app '" + normalizedResult.app + "'."
    );
    return baselineBaseReport(normalizedBaseline, normalizedResult, "NOT_EVALUATED", [], warnings, notes);
  }

  const scenarioEntry = normalizedBaseline.scenarios[normalizedResult.level];
  const scenarioMetrics = isRecord(scenarioEntry) ? scenarioEntry.metrics : undefined;
  const findings = [];
  let hasMissingData = normalizedResult.valid === false;
  let hasRegression = false;

  if (normalizedResult.valid === false) {
    warnings.push("Performance result marked valid=false; treating comparison as insufficient data.");
  }
  if (!isRecord(scenarioMetrics)) {
    hasMissingData = true;
    warnings.push("Baseline scenario '" + normalizedResult.level + "' is missing metrics.");
  }

  for (const spec of QI_BASELINE_METRICS) {
    const baselineValue = isRecord(scenarioMetrics) ? toFiniteNumber(scenarioMetrics[spec.baselineKey]) : null;
    const actualValue = getNumericMetric(normalizedResult.metrics, spec.resultPath);

    if (baselineValue === null || actualValue === null) {
      findings.push({
        metric: spec.metric,
        baseline: baselineValue,
        actual: actualValue,
        absoluteDelta: null,
        relativeDeltaPercent: null,
        regressed: null,
        direction: spec.direction,
        severity: "warning",
        message: "Missing numeric metric for baseline comparison: " + spec.metric,
      });
      hasMissingData = true;
      continue;
    }

    const absoluteDelta = actualValue - baselineValue;
    const relativeDeltaPercent = baselineValue === 0 ? null : (absoluteDelta / baselineValue) * 100;
    const regressed = spec.direction === "higher-is-worse"
      ? actualValue > baselineValue
      : actualValue < baselineValue;
    if (regressed) {
      hasRegression = true;
    }

    findings.push({
      metric: spec.metric,
      baseline: baselineValue,
      actual: actualValue,
      absoluteDelta: absoluteDelta,
      relativeDeltaPercent: relativeDeltaPercent,
      regressed: regressed,
      direction: spec.direction,
      severity: regressed ? "warning" : "info",
      message: regressed
        ? spec.metric + " regressed versus baseline."
        : spec.metric + " does not regress versus baseline.",
    });
  }

  const verdict = hasMissingData ? "INSUFFICIENT_DATA" : hasRegression ? "REGRESSION" : "PASS";
  return baselineBaseReport(normalizedBaseline, normalizedResult, verdict, findings, warnings, notes);
}

// Resolves the Quality Impact file set for one app, mirroring the layout
// `qaff evaluate-quality-impact --project` uses.
function qiComparePerformanceBaseline(root, args) {
  const options = args || {};
  const perfDir = path.join(root, "framework-performance");
  if (!isDirectory(perfDir)) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "framework-performance/ was not found. Enable packs.qualityImpact and re-run qaff create.",
      sideEffects: "none",
    };
  }

  const explicitResult = typeof options.runRef === "string" && options.runRef.length > 0;
  if (!explicitResult && (typeof options.app !== "string" || options.app.length === 0)) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "Provide app (or runRef pointing at a qaff/performance-result/v1 file).",
      sideEffects: "none",
    };
  }

  const resultPath = explicitResult
    ? safeResolve(root, options.runRef)
    : path.join(perfDir, "reports", options.app + ".result.json");
  if (!isFile(resultPath)) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "Performance result file not found: " + relPath(root, resultPath)
        + ". Run the performance smoke test first, then import it with qaff import-performance-result.",
      sideEffects: "none",
    };
  }

  let result;
  try {
    result = readJsonFile(resultPath);
  } catch (error) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "Performance result is not valid JSON: " + errorMessage(error),
      sideEffects: "none",
    };
  }

  const appId = isRecord(result) && typeof result.app === "string" && result.app.length > 0
    ? result.app
    : options.app;
  if (typeof appId !== "string" || appId.length === 0) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "Performance result is missing the app field.",
      sideEffects: "none",
    };
  }
  if (typeof options.scenario === "string" && options.scenario.length > 0
    && isRecord(result) && result.scenario !== options.scenario) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: "Requested scenario '" + options.scenario + "' does not match the result scenario '"
        + String(isRecord(result) ? result.scenario : "") + "'.",
      sideEffects: "none",
    };
  }

  const baselinePath = typeof options.baselineRef === "string" && options.baselineRef.length > 0
    ? safeResolve(root, options.baselineRef)
    : path.join(perfDir, "baseline", appId + ".baseline.json");
  const thresholdsPath = typeof options.thresholdsRef === "string" && options.thresholdsRef.length > 0
    ? safeResolve(root, options.thresholdsRef)
    : path.join(perfDir, "thresholds.yaml");

  for (const required of [{ label: "Baseline", target: baselinePath }, { label: "Thresholds", target: thresholdsPath }]) {
    if (!isFile(required.target)) {
      return {
        status: "ERROR",
        tool: "compare_performance_baseline",
        message: required.label + " file not found: " + relPath(root, required.target),
        sideEffects: "none",
      };
    }
  }

  let thresholdEvaluation;
  let baselineComparison;
  try {
    const thresholds = parseYamlSubset(fs.readFileSync(thresholdsPath, "utf8"));
    thresholdEvaluation = evaluateThresholdModel(thresholds, result);
    baselineComparison = evaluateBaselineModel(readJsonFile(baselinePath), result);
  } catch (error) {
    return {
      status: "ERROR",
      tool: "compare_performance_baseline",
      message: errorMessage(error),
      sideEffects: "none",
    };
  }

  const cliThreshold = path.join(perfDir, "reports", appId + ".threshold-evaluation.json");
  const cliBaseline = path.join(perfDir, "reports", appId + ".baseline-comparison.json");

  return {
    status: "OK",
    tool: "compare_performance_baseline",
    app: appId,
    scenario: thresholdEvaluation.scenario,
    level: thresholdEvaluation.level,
    inputs: {
      result: relPath(root, resultPath),
      baseline: relPath(root, baselinePath),
      thresholds: relPath(root, thresholdsPath),
    },
    thresholdEvaluation: thresholdEvaluation,
    baselineComparison: baselineComparison,
    cliReports: {
      thresholdEvaluation: isFile(cliThreshold) ? relPath(root, cliThreshold) : null,
      baselineComparison: isFile(cliBaseline) ? relPath(root, cliBaseline) : null,
    },
    enforcement: "advisory-only; this tool never gates a build and never updates a baseline",
    sideEffects: "none",
  };
}

// ── Allure result reading (port) ──────────────────────────────────────────
// Literal port of generator/src/results/allureResultsReader.ts: the same file
// discovery, status normalisation, duration rule, failure categories, warning
// text and sort order. generator/test/mcpReadTestResults.test.cjs asserts the
// totals and the failed-test projection deepEqual that module's output.
//
// The layer resolution mirrors `qaff analyze-failures` project mode
// (generator/src/commands/analyzeFailures.ts), including its skip reasons.

const ALLURE_ANALYZABLE_LAYERS = [
  "web-desktop",
  "web-mobile",
  "mobile-appium",
  "android",
  "ios",
  "api",
  "integration",
];
const ALLURE_PERFORMANCE_SKIP_REASON =
  "performance layer uses JMeter/Gatling reporters; use import-performance-result instead";
const ALLURE_UNSUPPORTED_LAYER_SKIP_REASON =
  "layer is not analyzable by analyze-failures (supported: web-desktop, web-mobile, mobile-appium, android, ios, api, integration)";
const ALLURE_TRACE_EXCERPT_LIMIT = 400;

// ts-* (Playwright) projects — port of generator/src/results/playwrightAllureResults.ts.
// allure-playwright writes every app and layer into one root allure-results/;
// a result is attributed by its fullName "<app-id>/<layer>/tests/<file>:<line>:<col>".
const PLAYWRIGHT_ALLURE_RESULTS_DIR = "allure-results";
const PLAYWRIGHT_ANALYZABLE_LAYERS = ["web-desktop", "web-mobile", "api", "integration", "performance"];
const PLAYWRIGHT_UNSUPPORTED_LAYER_SKIP_REASON =
  "layer is not analyzable by analyze-failures (supported: web-desktop, web-mobile, api, integration, performance)";

function playwrightNoResultsMessage(appId, layer) {
  return "No allure-playwright results attributed to apps/" + appId + "/" + layer + " were found.";
}

function attributePlaywrightAllureResult(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.fullName !== "string") {
    return null;
  }
  const segments = parsed.fullName.split("/");
  if (segments.length < 3 || segments[0].length === 0 || segments[1].length === 0) {
    return null;
  }
  return { appId: segments[0], layer: segments[1] };
}

function allureReadError(message) {
  const error = new Error(message);
  error.allureRead = true;
  return error;
}

function allureRequiredString(source, key, filePath) {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw allureReadError("Missing required string field '" + key + "' in " + filePath);
  }
  return value;
}

function allureOptionalString(source, key) {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function allureOptionalNumber(source, key) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function allureDuration(start, stop) {
  if (typeof start !== "number" || typeof stop !== "number" || stop < start) {
    return 0;
  }
  return stop - start;
}

function allureNormalizeStatus(rawStatus, source, warnings) {
  if (rawStatus === "passed" || rawStatus === "failed" || rawStatus === "broken" || rawStatus === "skipped") {
    return rawStatus;
  }
  warnings.push("Unknown Allure status in " + source + ": " + rawStatus);
  return "unknown";
}

function allureNormalizeError(value) {
  if (!isRecord(value)) {
    return undefined;
  }
  const message = allureOptionalString(value, "message");
  const trace = allureOptionalString(value, "trace");
  if (!message && !trace) {
    return undefined;
  }
  return { message: message, trace: trace };
}

function allureFailureCategory(status, error) {
  if (status === "skipped") {
    return "skipped";
  }
  if (status === "broken") {
    return "broken_test";
  }
  if (status === "failed") {
    const text = ((error && error.message) || "") + "\n" + ((error && error.trace) || "");
    const lowered = text.toLowerCase();
    if (lowered.indexOf("assert") >= 0 || lowered.indexOf("expected") >= 0) {
      return "assertion_failure";
    }
    return "exception";
  }
  if (status === "unknown" && error) {
    return "unknown_failure";
  }
  return undefined;
}

function allureCountAttachments(value) {
  return Array.isArray(value) ? value.filter((entry) => isRecord(entry)).length : 0;
}

function allureNormalizeSteps(value, filePath, warnings, parentKey) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((step, index) => {
    const stepKey = parentKey === "" ? String(index + 1) : parentKey + "." + String(index + 1);
    if (!isRecord(step)) {
      throw allureReadError("Allure step must be an object in " + filePath);
    }
    const name = allureRequiredString(step, "name", filePath);
    const status = allureNormalizeStatus(
      allureOptionalString(step, "status") || "unknown",
      filePath + "#step-" + stepKey,
      warnings
    );
    return {
      name: name,
      status: status,
      attachmentCount: allureCountAttachments(step.attachments),
      steps: allureNormalizeSteps(step.steps, filePath, warnings, stepKey),
    };
  });
}

function allureCollectFailedStepNames(steps, output) {
  for (const step of steps) {
    if (step.status === "failed" || step.status === "broken" || step.status === "unknown") {
      output.push(step.name);
    }
    allureCollectFailedStepNames(step.steps, output);
  }
  return output;
}

function allureCountStepAttachments(steps) {
  let total = 0;
  for (const step of steps) {
    total += step.attachmentCount + allureCountStepAttachments(step.steps);
  }
  return total;
}

function allureNormalizeLabels(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => isRecord(entry))
    .map((entry) => ({
      name: allureRequiredString(entry, "name", "labels"),
      value: allureRequiredString(entry, "value", "labels"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.value.localeCompare(right.value));
}

function allureListFiles(rootDir) {
  const relativePaths = [];
  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
      if (relativePath.endsWith("-result.json") || relativePath.endsWith("-container.json")) {
        relativePaths.push(relativePath);
      }
    }
  };
  walk(rootDir);
  return relativePaths.sort((left, right) => left.localeCompare(right));
}

function allureParseResultFile(relativePath, content, warnings) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw allureReadError("Malformed Allure JSON in " + relativePath + ": " + errorMessage(error));
  }
  if (!isRecord(parsed)) {
    throw allureReadError("Allure JSON file must contain an object: " + relativePath);
  }

  const name = allureRequiredString(parsed, "name", relativePath);
  const status = allureNormalizeStatus(
    allureRequiredString(parsed, "status", relativePath),
    relativePath,
    warnings
  );
  const id = allureOptionalString(parsed, "uuid") || "file:" + relativePath;
  const start = allureOptionalNumber(parsed, "start");
  const stop = allureOptionalNumber(parsed, "stop");
  const error = allureNormalizeError(parsed.statusDetails);
  const steps = allureNormalizeSteps(parsed.steps, relativePath, warnings, "");

  return {
    id: id,
    name: name,
    fullName: allureOptionalString(parsed, "fullName"),
    status: status,
    durationMs: allureDuration(start, stop),
    labels: allureNormalizeLabels(parsed.labels),
    steps: steps,
    attachmentCount: allureCountAttachments(parsed.attachments) + allureCountStepAttachments(steps),
    error: error,
    failureCategory: allureFailureCategory(status, error),
  };
}

// playwrightTarget ({ appId, layer }) narrows the shared ts-* allure-results/
// to one app/layer; container files are then left out (see the generator module).
function allureReadDirectory(rootDir, playwrightTarget) {
  const relativePaths = allureListFiles(rootDir);
  let files;
  let containerPaths;
  if (playwrightTarget) {
    files = relativePaths
      .filter((entry) => entry.endsWith("-result.json"))
      .map((relativePath) => ({ relativePath: relativePath, content: fs.readFileSync(path.join(rootDir, relativePath), "utf8") }))
      .filter((file) => {
        const attribution = attributePlaywrightAllureResult(file.content);
        return attribution !== null && attribution.appId === playwrightTarget.appId && attribution.layer === playwrightTarget.layer;
      });
    if (files.length === 0) {
      throw allureReadError(playwrightNoResultsMessage(playwrightTarget.appId, playwrightTarget.layer));
    }
    containerPaths = [];
  } else {
    if (relativePaths.length === 0) {
      throw allureReadError("No Allure *-result.json files were found.");
    }
    files = relativePaths
      .filter((entry) => entry.endsWith("-result.json"))
      .map((relativePath) => ({ relativePath: relativePath, content: null }));
    containerPaths = relativePaths.filter((entry) => entry.endsWith("-container.json"));
    if (files.length === 0) {
      throw allureReadError("No Allure *-result.json files were found.");
    }
  }
  const resultPaths = files.map((file) => file.relativePath);

  const warnings = [];
  const tests = files
    .map((file) =>
      allureParseResultFile(
        file.relativePath,
        file.content === null ? fs.readFileSync(path.join(rootDir, file.relativePath), "utf8") : file.content,
        warnings
      )
    )
    .sort((left, right) =>
      (left.fullName || "").localeCompare(right.fullName || "")
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id)
    );

  const seenIds = new Set(tests.map((test) => test.id));
  const containerWarnings = [];
  for (const relativePath of containerPaths) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
    } catch (error) {
      throw allureReadError("Malformed Allure JSON in " + relativePath + ": " + errorMessage(error));
    }
    if (!isRecord(parsed)) {
      throw allureReadError("Allure JSON file must contain an object: " + relativePath);
    }
    const children = Array.isArray(parsed.children)
      ? parsed.children.filter((value) => typeof value === "string" && value.trim().length > 0)
      : [];
    for (const childId of children) {
      if (!seenIds.has(childId)) {
        containerWarnings.push("Container " + relativePath + " references missing child UUID: " + childId);
      }
    }
  }
  for (const warning of containerWarnings.sort()) {
    warnings.push(warning);
  }

  const totals = { total: tests.length, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, durationMs: 0 };
  for (const test of tests) {
    totals[test.status] += 1;
    totals.durationMs += test.durationMs;
  }

  return {
    source: { format: "allure2", resultFiles: resultPaths.length, containerFiles: containerPaths.length },
    totals: totals,
    tests: tests,
    warnings: warnings,
  };
}

function allureFailedTestPayload(test) {
  const trace = (test.error && test.error.trace) || "";
  const payload = {
    id: test.id,
    name: test.name,
    fullName: test.fullName === undefined ? null : test.fullName,
    status: test.status,
    durationMs: test.durationMs,
    failureCategory: test.failureCategory === undefined ? null : test.failureCategory,
    labels: test.labels,
    failedSteps: allureCollectFailedStepNames(test.steps, []),
    attachmentCount: test.attachmentCount,
    error: null,
  };
  if (test.error) {
    payload.error = {
      message: test.error.message === undefined ? null : test.error.message,
      traceExcerpt: trace.slice(0, ALLURE_TRACE_EXCERPT_LIMIT),
      traceTruncated: trace.length > ALLURE_TRACE_EXCERPT_LIMIT,
    };
  }
  return payload;
}

// Projection of the deterministic reports `qaff analyze-failures` writes. The
// server never computes an analysis itself — it only surfaces one that already
// exists on disk.
function allureAnalysisProjection(root, candidate, fields) {
  if (!isFile(candidate)) {
    return null;
  }
  let parsed;
  try {
    parsed = readJsonFile(candidate);
  } catch (error) {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const projection = { path: relPath(root, candidate) };
  for (const field of fields) {
    projection[field] = typeof parsed[field] === "string" ? parsed[field] : null;
  }
  return projection;
}

function allureLayerEntry(root, appId, layer, resultsDir, playwrightTarget) {
  let summary;
  try {
    summary = allureReadDirectory(resultsDir, playwrightTarget);
  } catch (error) {
    return { layer: layer, present: false, skipReason: errorMessage(error) };
  }
  return {
    layer: layer,
    present: true,
    resultsPath: relPath(root, resultsDir),
    source: summary.source,
    totals: summary.totals,
    failedTests: summary.tests
      .filter((test) => test.status === "failed" || test.status === "broken")
      .map(allureFailedTestPayload),
    warnings: summary.warnings,
    failureAnalysis: allureAnalysisProjection(
      root,
      path.join(root, "apps", appId, "reports", "failure-analysis", layer, "failure-analysis.json"),
      ["verdict", "analysisCategory", "confidence", "releaseRisk"]
    ),
  };
}

// Mirrors resolvePlaywrightLayer in generator/src/commands/analyzeFailures.ts.
function playwrightLayerEntry(root, appId, appLayers, layer) {
  if (PLAYWRIGHT_ANALYZABLE_LAYERS.indexOf(layer) < 0) {
    return { layer: layer, present: false, skipReason: PLAYWRIGHT_UNSUPPORTED_LAYER_SKIP_REASON };
  }
  if (appLayers.indexOf(layer) < 0) {
    return {
      layer: layer,
      present: false,
      skipReason: "layer '" + layer + "' not present in app '" + appId + "' in lock file",
    };
  }
  const resultsDir = path.join(root, PLAYWRIGHT_ALLURE_RESULTS_DIR);
  if (!isDirectory(resultsDir)) {
    return {
      layer: layer,
      present: false,
      skipReason: "allure-results directory not found: " + relPath(root, resultsDir),
    };
  }
  return allureLayerEntry(root, appId, layer, resultsDir, { appId: appId, layer: layer });
}

function mcpReadTestResults(root, args) {
  const options = args || {};
  const explicitRun = typeof options.runRef === "string" && options.runRef.length > 0;

  if (explicitRun) {
    const resultsDir = safeResolve(root, options.runRef);
    if (!isDirectory(resultsDir)) {
      return {
        status: "ERROR",
        tool: "read_test_results",
        message: "allure-results directory not found: " + relPath(root, resultsDir),
        sideEffects: "none",
      };
    }
    const appId = typeof options.app === "string" && options.app.length > 0 ? options.app : null;
    const layer = typeof options.layer === "string" && options.layer.length > 0 ? options.layer : null;
    const entry = allureLayerEntry(root, appId || "", layer || "", resultsDir);
    if (!entry.present) {
      return { status: "ERROR", tool: "read_test_results", message: entry.skipReason, sideEffects: "none" };
    }
    entry.layer = layer;
    entry.failureAnalysis = null;
    return {
      status: "OK",
      tool: "read_test_results",
      $schema: "qaff/mcp-test-results/v1",
      mode: "runRef",
      apps: [{ appId: appId, failureAnalysis: null, layers: [entry] }],
      sideEffects: "none",
    };
  }

  const lock = readLock(root);
  if (!lock.ok) {
    return { status: "ERROR", tool: "read_test_results", message: lock.message, path: lock.path, sideEffects: "none" };
  }

  const lockApps = Array.isArray(lock.data.apps) ? lock.data.apps : [];
  const selectedApps = (typeof options.app === "string" && options.app.length > 0
    ? lockApps.filter((app) => app && app.id === options.app)
    : lockApps.slice()
  ).sort((left, right) => String(left.id).localeCompare(String(right.id)));

  if (selectedApps.length === 0) {
    return {
      status: "ERROR",
      tool: "read_test_results",
      message: typeof options.app === "string" && options.app.length > 0
        ? "App '" + options.app + "' is not present in qa-factory.lock.json."
        : "qa-factory.lock.json declares no apps.",
      sideEffects: "none",
    };
  }

  const playwright = typeof lock.data.blueprintId === "string" && lock.data.blueprintId.startsWith("ts-");
  const apps = [];
  let presentLayers = 0;
  for (const app of selectedApps) {
    const appId = String(app.id);
    const appLayers = Array.isArray(app.layers) ? app.layers.map(String) : [];
    const requested = typeof options.layer === "string" && options.layer.length > 0
      ? [options.layer]
      : appLayers.slice();
    const layers = requested.slice().sort().map((layer) => {
      if (playwright) {
        return playwrightLayerEntry(root, appId, appLayers, layer);
      }
      if (layer === "performance") {
        return { layer: layer, present: false, skipReason: ALLURE_PERFORMANCE_SKIP_REASON };
      }
      if (ALLURE_ANALYZABLE_LAYERS.indexOf(layer) < 0) {
        return { layer: layer, present: false, skipReason: ALLURE_UNSUPPORTED_LAYER_SKIP_REASON };
      }
      if (appLayers.indexOf(layer) < 0) {
        return {
          layer: layer,
          present: false,
          skipReason: "layer '" + layer + "' not present in app '" + appId + "' in lock file",
        };
      }
      const resultsDir = path.join(root, "apps", appId, layer, "target", "allure-results");
      if (!isDirectory(resultsDir)) {
        return {
          layer: layer,
          present: false,
          skipReason: "allure-results directory not found: " + relPath(root, resultsDir),
        };
      }
      return allureLayerEntry(root, appId, layer, resultsDir);
    });

    for (const entry of layers) {
      if (entry.present) {
        presentLayers += 1;
      }
    }

    apps.push({
      appId: appId,
      failureAnalysis: allureAnalysisProjection(
        root,
        path.join(root, "apps", appId, "reports", "failure-analysis", "summary.json"),
        ["overallVerdict", "overallCategory"]
      ),
      layers: layers,
    });
  }

  if (presentLayers === 0) {
    return {
      status: "ERROR",
      tool: "read_test_results",
      message: "No analyzable allure-results were found. Run the test suite first, then retry.",
      apps: apps,
      sideEffects: "none",
    };
  }

  return {
    status: "OK",
    tool: "read_test_results",
    $schema: "qaff/mcp-test-results/v1",
    mode: "project",
    apps: apps,
    sideEffects: "none",
  };
}

// ── AI authoring readiness + implementation plan (port) ───────────────────
// Literal port of generator/src/validation/aiAuthoringContractsValidator.ts,
// aiAuthoringContractsNormalizer.ts and aiAuthoringReadinessEvaluator.ts, plus
// a JSON rendition of the structural rules in aiTestImplementationPlanRenderer.ts
// and the package rules in generator/src/generate/basePackage.ts.
//
// generator/test/mcpSuggestTestImplementation.test.cjs asserts the readiness
// block deepEquals evaluateAiAuthoringReadiness for the same inputs. The tool
// never writes a file and never emits Java code — it returns a plan.

const AUTHORING_FIELD_ORDER = {
  "scenario-contract": ["schemaVersion", "id", "title", "appId", "layer", "source", "steps", "expectedResults", "authoringConstraints", "unknowns"],
  "test-authoring-request": ["schemaVersion", "requestId", "scenarioContractRef", "target", "requiredEvidenceRefs", "allowedFiles", "forbiddenChanges", "validationCommands", "reviewContractRef"],
  "locator-evidence": ["schemaVersion", "evidenceId", "appId", "pageOrComponent", "source", "elements", "prohibitedSelectors", "gaps"],
  "allure-step-mapping": ["schemaVersion", "scenarioId", "feature", "story", "severity", "mappings", "assertions"],
};

function authoringFieldOrderForPath(candidate) {
  if (candidate.endsWith(".source")) {
    return ["type", "reference", "path", "note"];
  }
  if (candidate === "$.target") {
    return ["appId", "layer"];
  }
  if (/^\$\.steps\[\d+\]$/.test(candidate)) {
    return ["id", "action"];
  }
  if (/^\$\.expectedResults\[\d+\]$/.test(candidate)) {
    return ["stepId", "result"];
  }
  if (/^\$\.elements\[\d+\]$/.test(candidate)) {
    return ["name", "candidateSelector", "rationale"];
  }
  if (/^\$\.mappings\[\d+\]$/.test(candidate)) {
    return ["scenarioStepId", "allureStep"];
  }
  if (/^\$\.assertions\[\d+\]$/.test(candidate)) {
    return ["scenarioStepId", "expected"];
  }
  return [];
}

function authoringExpectString(value, key, basePath, code, issues) {
  const raw = value[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    issues.push({ code: code, path: basePath + "." + key, message: key + " must be a non-empty string." });
    return null;
  }
  return raw;
}

function authoringExpectNumber(value, key, basePath, code, issues) {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.push({ code: code, path: basePath + "." + key, message: key + " must be a finite number." });
    return null;
  }
  return raw;
}

function authoringExpectArray(value, key, basePath, code, issues) {
  const raw = value[key];
  if (!Array.isArray(raw)) {
    issues.push({ code: code, path: basePath + "." + key, message: key + " must be an array." });
    return null;
  }
  return raw;
}

function authoringAsRecord(value, candidatePath, code, issues) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ code: code, path: candidatePath, message: "value must be an object." });
    return null;
  }
  return value;
}

function authoringFail(contractType, issues) {
  return { ok: false, contractType: contractType, data: null, issues: issues };
}

function authoringFinalize(contractType, value, issues) {
  if (issues.length > 0) {
    return authoringFail(contractType, issues);
  }
  return { ok: true, contractType: contractType, data: value, issues: [] };
}

function validateAuthoringContract(contractType, input) {
  const issues = [];
  if (contractType === "scenario-contract") {
    const value = authoringAsRecord(input, "$", "SCENARIO_NOT_OBJECT", issues);
    if (value === null) {
      return authoringFail(contractType, issues);
    }
    authoringExpectNumber(value, "schemaVersion", "$", "SCHEMA_VERSION_INVALID", issues);
    authoringExpectString(value, "id", "$", "ID_INVALID", issues);
    authoringExpectString(value, "title", "$", "TITLE_INVALID", issues);
    authoringExpectString(value, "appId", "$", "APP_ID_INVALID", issues);
    authoringExpectString(value, "layer", "$", "LAYER_INVALID", issues);
    const steps = authoringExpectArray(value, "steps", "$", "STEPS_INVALID", issues);
    if (steps !== null) {
      steps.forEach((entry, index) => {
        const step = authoringAsRecord(entry, "$.steps[" + index + "]", "STEP_NOT_OBJECT", issues);
        if (step === null) {
          return;
        }
        authoringExpectString(step, "id", "$.steps[" + index + "]", "STEP_ID_INVALID", issues);
        authoringExpectString(step, "action", "$.steps[" + index + "]", "STEP_ACTION_INVALID", issues);
      });
    }
    const expectedResults = authoringExpectArray(value, "expectedResults", "$", "EXPECTED_RESULTS_INVALID", issues);
    if (expectedResults !== null) {
      expectedResults.forEach((entry, index) => {
        const expected = authoringAsRecord(entry, "$.expectedResults[" + index + "]", "EXPECTED_RESULT_NOT_OBJECT", issues);
        if (expected === null) {
          return;
        }
        authoringExpectString(expected, "stepId", "$.expectedResults[" + index + "]", "EXPECTED_STEP_ID_INVALID", issues);
        authoringExpectString(expected, "result", "$.expectedResults[" + index + "]", "EXPECTED_RESULT_INVALID", issues);
      });
    }
    authoringExpectArray(value, "authoringConstraints", "$", "AUTHORING_CONSTRAINTS_INVALID", issues);
    authoringExpectArray(value, "unknowns", "$", "UNKNOWNS_INVALID", issues);
    return authoringFinalize(contractType, value, issues);
  }

  if (contractType === "test-authoring-request") {
    const value = authoringAsRecord(input, "$", "REQUEST_NOT_OBJECT", issues);
    if (value === null) {
      return authoringFail(contractType, issues);
    }
    authoringExpectNumber(value, "schemaVersion", "$", "SCHEMA_VERSION_INVALID", issues);
    authoringExpectString(value, "requestId", "$", "REQUEST_ID_INVALID", issues);
    authoringExpectString(value, "scenarioContractRef", "$", "SCENARIO_REF_INVALID", issues);
    authoringExpectString(value, "reviewContractRef", "$", "REVIEW_REF_INVALID", issues);
    const target = authoringAsRecord(value.target, "$.target", "TARGET_INVALID", issues);
    if (target !== null) {
      authoringExpectString(target, "appId", "$.target", "TARGET_APP_ID_INVALID", issues);
      authoringExpectString(target, "layer", "$.target", "TARGET_LAYER_INVALID", issues);
    }
    authoringExpectArray(value, "requiredEvidenceRefs", "$", "EVIDENCE_REFS_INVALID", issues);
    authoringExpectArray(value, "allowedFiles", "$", "ALLOWED_FILES_INVALID", issues);
    authoringExpectArray(value, "forbiddenChanges", "$", "FORBIDDEN_CHANGES_INVALID", issues);
    authoringExpectArray(value, "validationCommands", "$", "VALIDATION_COMMANDS_INVALID", issues);
    return authoringFinalize(contractType, value, issues);
  }

  if (contractType === "locator-evidence") {
    const value = authoringAsRecord(input, "$", "LOCATOR_EVIDENCE_NOT_OBJECT", issues);
    if (value === null) {
      return authoringFail(contractType, issues);
    }
    authoringExpectNumber(value, "schemaVersion", "$", "SCHEMA_VERSION_INVALID", issues);
    authoringExpectString(value, "evidenceId", "$", "EVIDENCE_ID_INVALID", issues);
    authoringExpectString(value, "appId", "$", "APP_ID_INVALID", issues);
    authoringExpectString(value, "pageOrComponent", "$", "PAGE_COMPONENT_INVALID", issues);
    const source = authoringAsRecord(value.source, "$.source", "SOURCE_INVALID", issues);
    if (source !== null) {
      authoringExpectString(source, "type", "$.source", "SOURCE_TYPE_INVALID", issues);
      authoringExpectString(source, "path", "$.source", "SOURCE_PATH_INVALID", issues);
    }
    const elements = authoringExpectArray(value, "elements", "$", "ELEMENTS_INVALID", issues);
    if (elements !== null) {
      elements.forEach((entry, index) => {
        const element = authoringAsRecord(entry, "$.elements[" + index + "]", "ELEMENT_NOT_OBJECT", issues);
        if (element === null) {
          return;
        }
        authoringExpectString(element, "name", "$.elements[" + index + "]", "ELEMENT_NAME_INVALID", issues);
        authoringExpectString(element, "candidateSelector", "$.elements[" + index + "]", "ELEMENT_SELECTOR_INVALID", issues);
        authoringExpectString(element, "rationale", "$.elements[" + index + "]", "ELEMENT_RATIONALE_INVALID", issues);
      });
    }
    authoringExpectArray(value, "prohibitedSelectors", "$", "PROHIBITED_SELECTORS_INVALID", issues);
    authoringExpectArray(value, "gaps", "$", "GAPS_INVALID", issues);
    return authoringFinalize(contractType, value, issues);
  }

  if (contractType === "allure-step-mapping") {
    const value = authoringAsRecord(input, "$", "ALLURE_MAPPING_NOT_OBJECT", issues);
    if (value === null) {
      return authoringFail(contractType, issues);
    }
    authoringExpectNumber(value, "schemaVersion", "$", "SCHEMA_VERSION_INVALID", issues);
    authoringExpectString(value, "scenarioId", "$", "SCENARIO_ID_INVALID", issues);
    const mappings = authoringExpectArray(value, "mappings", "$", "MAPPINGS_INVALID", issues);
    if (mappings !== null) {
      mappings.forEach((entry, index) => {
        const mapping = authoringAsRecord(entry, "$.mappings[" + index + "]", "MAPPING_NOT_OBJECT", issues);
        if (mapping === null) {
          return;
        }
        authoringExpectString(mapping, "scenarioStepId", "$.mappings[" + index + "]", "MAPPING_STEP_ID_INVALID", issues);
        authoringExpectString(mapping, "allureStep", "$.mappings[" + index + "]", "MAPPING_STEP_INVALID", issues);
      });
    }
    const assertions = authoringExpectArray(value, "assertions", "$", "ASSERTIONS_INVALID", issues);
    if (assertions !== null) {
      assertions.forEach((entry, index) => {
        const assertion = authoringAsRecord(entry, "$.assertions[" + index + "]", "ASSERTION_NOT_OBJECT", issues);
        if (assertion === null) {
          return;
        }
        authoringExpectString(assertion, "scenarioStepId", "$.assertions[" + index + "]", "ASSERTION_STEP_ID_INVALID", issues);
        authoringExpectString(assertion, "expected", "$.assertions[" + index + "]", "ASSERTION_EXPECTED_INVALID", issues);
      });
    }
    return authoringFinalize(contractType, value, issues);
  }

  issues.push({ code: "CONTRACT_TYPE_UNSUPPORTED", path: "$", message: "Unsupported contract type: " + contractType });
  return authoringFail(contractType, issues);
}

// Normalization port. Contracts reach this runtime as JSON (from disk or over
// JSON-RPC), so the undefined / bigint / function / symbol branches of the
// generator's normalizer are unreachable here; the reachable outcome is the
// STRING_TRIMMED warning, which readiness surfaces.
function authoringOrderedKeys(input, fieldOrder) {
  const present = Object.keys(input);
  const ordered = fieldOrder.filter((key) => present.indexOf(key) >= 0);
  const extras = present.filter((key) => fieldOrder.indexOf(key) < 0).sort();
  return ordered.concat(extras);
}

function authoringNormalizeValue(input, candidatePath, state) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed !== input) {
      state.warnings.push({
        code: "STRING_TRIMMED",
        path: candidatePath,
        message: "String value was trimmed for deterministic normalization.",
      });
    }
    return;
  }
  if (input === null || typeof input === "number" || typeof input === "boolean") {
    return;
  }
  if (input === undefined) {
    state.warnings.push({
      code: "UNDEFINED_FIELD_OMITTED",
      path: candidatePath,
      message: "Undefined value was omitted because AI authoring contracts are JSON-shaped.",
    });
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      authoringNormalizeValue(item, candidatePath + "[" + index + "]", state);
    });
    return;
  }
  if (isRecord(input)) {
    authoringNormalizeRecord(input, candidatePath, authoringFieldOrderForPath(candidatePath), state);
    return;
  }
  state.issues.push({
    code: "VALUE_UNSUPPORTED",
    path: candidatePath,
    message: "Value must be a plain JSON-compatible object for deterministic normalization.",
  });
}

function authoringNormalizeRecord(input, basePath, fieldOrder, state) {
  for (const key of authoringOrderedKeys(input, fieldOrder)) {
    const childPath = basePath === "$" ? "$." + key : basePath + "." + key;
    authoringNormalizeValue(input[key], childPath, state);
  }
}

function normalizeAuthoringContract(contractType, input) {
  const validation = validateAuthoringContract(contractType, input);
  if (!validation.ok || validation.data === null) {
    return { ok: false, warnings: [] };
  }
  const state = { issues: [], warnings: [] };
  authoringNormalizeRecord(validation.data, "$", AUTHORING_FIELD_ORDER[contractType] || [], state);
  if (state.issues.length > 0) {
    return { ok: false, warnings: state.warnings };
  }
  return { ok: true, warnings: state.warnings };
}

const AUTHORING_FAKE_PATTERNS = [
  /fake_?password/gi,
  /password["\s:=]*fake/gi,
  /api[_-]?key["\s:=]*fake/gi,
  /fake[_-]?api[_-]?key/gi,
  /https?:\/\/fake-/gi,
  /https?:\/\/(fake\.|example\.com\/api)/gi,
  /jira\.example\.com/gi,
  /zephyr\.example\.com/gi,
  /secret["\s:=]*my_secret/gi,
];

function authoringValidateAndTrack(contract, contractType, requiredInputs, reasons, warnings) {
  if (contract === undefined || contract === null) {
    requiredInputs.push(contractType);
    return false;
  }
  const result = validateAuthoringContract(contractType, contract);
  if (!result.ok) {
    reasons.push({
      code: contractType.toUpperCase() + "_INVALID",
      message: contractType + " contract is invalid: " + result.issues.map((issue) => issue.message).join("; "),
      path: "$." + contractType,
    });
    return false;
  }
  const normalized = normalizeAuthoringContract(contractType, contract);
  if (!normalized.ok) {
    reasons.push({
      code: contractType.toUpperCase() + "_NORMALIZATION_FAILED",
      message: contractType + " contract could not be normalized.",
      path: "$." + contractType,
    });
    return false;
  }
  for (const warning of normalized.warnings) {
    warnings.push({
      code: contractType.toUpperCase() + "_" + warning.code,
      message: warning.message,
      path: "$." + contractType + (warning.path === "$" ? "" : warning.path),
    });
  }
  return true;
}

function evaluateAiAuthoringReadiness(input, metadata) {
  const reasons = [];
  const warnings = [];
  const requiredInputs = [];
  let verdict = "READY";

  const scenarioOk = authoringValidateAndTrack(input.scenarioContract, "scenario-contract", requiredInputs, reasons, warnings);
  const requestOk = authoringValidateAndTrack(input.testAuthoringRequest, "test-authoring-request", requiredInputs, reasons, warnings);
  const locatorOk = authoringValidateAndTrack(input.locatorEvidenceContract, "locator-evidence", requiredInputs, reasons, warnings);
  authoringValidateAndTrack(input.allureStepMappingContract, "allure-step-mapping", requiredInputs, reasons, warnings);

  if (!scenarioOk) {
    reasons.push({
      code: "SCENARIO_CONTRACT_INVALID_OR_MISSING",
      message: "Scenario contract is required and must be valid.",
      path: "$.scenarioContract",
    });
    verdict = "BLOCKED";
  }
  if (!requestOk) {
    reasons.push({
      code: "REQUEST_CONTRACT_INVALID_OR_MISSING",
      message: "Test authoring request is required and must be valid.",
      path: "$.testAuthoringRequest",
    });
    verdict = "BLOCKED";
  }

  const isWebDesktop = requestOk
    && isRecord(input.testAuthoringRequest)
    && isRecord(input.testAuthoringRequest.target)
    && input.testAuthoringRequest.target.layer === "web-desktop";

  if (isWebDesktop && !locatorOk) {
    reasons.push({
      code: "WEB_DESKTOP_MISSING_LOCATOR_EVIDENCE",
      message: "Web-desktop authoring requires locator evidence contract, but none was provided.",
      path: "$.locatorEvidenceContract",
    });
    verdict = "BLOCKED";
  }

  if (scenarioOk && isRecord(input.scenarioContract)) {
    const scenario = input.scenarioContract;
    const scenarioReasons = [];
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      scenarioReasons.push({
        code: "SCENARIO_STEPS_MISSING_OR_EMPTY",
        message: "Scenario contract must have at least one step.",
        path: "$.scenarioContract.steps",
      });
    }
    if (!Array.isArray(scenario.expectedResults) || scenario.expectedResults.length === 0) {
      scenarioReasons.push({
        code: "SCENARIO_EXPECTED_RESULTS_MISSING",
        message: "Scenario contract must have at least one expected result.",
        path: "$.scenarioContract.expectedResults",
      });
    }
    if (scenarioReasons.length > 0) {
      for (const reason of scenarioReasons) {
        reasons.push(reason);
      }
      verdict = "BLOCKED";
    }
  }

  if (requestOk && isRecord(input.testAuthoringRequest)) {
    const request = input.testAuthoringRequest;
    const requestReasons = [];
    if (typeof request.scenarioContractRef !== "string" || request.scenarioContractRef.length === 0) {
      requestReasons.push({
        code: "REQUEST_SCENARIO_REF_MISSING",
        message: "Test authoring request must reference a scenario contract.",
        path: "$.testAuthoringRequest.scenarioContractRef",
      });
    }
    if (typeof request.requestId !== "string" || request.requestId.length === 0) {
      requestReasons.push({
        code: "REQUEST_ID_MISSING",
        message: "Test authoring request must have a request ID.",
        path: "$.testAuthoringRequest.requestId",
      });
    }
    if (requestReasons.length > 0) {
      for (const reason of requestReasons) {
        reasons.push(reason);
      }
      verdict = "BLOCKED";
    }
  }

  if (locatorOk && isWebDesktop && isRecord(input.locatorEvidenceContract)) {
    const evidence = input.locatorEvidenceContract;
    const locatorReasons = [];
    const elements = evidence.elements;
    const gaps = evidence.gaps;
    const humanApprovalRequired = evidence.humanApprovalRequired;
    if ((!Array.isArray(elements) || elements.length === 0)
      && (!Array.isArray(gaps) || gaps.length === 0)
      && !humanApprovalRequired) {
      locatorReasons.push({
        code: "LOCATOR_EVIDENCE_EMPTY_NO_APPROVAL",
        message: "Locator evidence must have elements, explicit gaps, or humanApprovalRequired flag.",
        path: "$.locatorEvidenceContract.elements",
      });
    }
    if ((Array.isArray(gaps) && gaps.length > 0) || humanApprovalRequired) {
      locatorReasons.push({
        code: "LOCATOR_EVIDENCE_HAS_GAPS_OR_APPROVAL_NEEDED",
        message: "Locator evidence contains gaps or requires human approval.",
        path: "$.locatorEvidenceContract",
      });
    }
    const blockers = locatorReasons.filter((entry) => entry.code.indexOf("GAPS") < 0);
    if (blockers.length > 0) {
      for (const reason of blockers) {
        reasons.push(reason);
      }
      verdict = "BLOCKED";
    }
    const locatorWarnings = locatorReasons.filter((entry) => entry.code.indexOf("GAPS") >= 0);
    if (locatorWarnings.length > 0) {
      for (const warning of locatorWarnings) {
        warnings.push(warning);
      }
      if (verdict !== "BLOCKED") {
        verdict = "NEEDS_REVIEW";
      }
    }
  }

  const allText = JSON.stringify(input);
  for (const pattern of AUTHORING_FAKE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(allText)) {
      reasons.push({
        code: "SUSPICIOUS_INVENTED_CREDENTIALS_OR_URLS",
        message: "Contract contains obvious fake/invented credentials, URLs, or service references.",
        path: "$.input",
      });
      verdict = "BLOCKED";
      break;
    }
  }

  const playwright = Boolean(metadata && typeof metadata.blueprint === "string" && metadata.blueprint.startsWith("ts-"));
  const validationCommands = playwright
    ? ["qaff verify --project .", "npm test"]
    : ["qaff verify --project .", "mvn -B verify"];
  if (metadata && metadata.targetAppId && metadata.targetLayer) {
    validationCommands.push(playwright
      ? "npx playwright test --project " + metadata.targetLayer
      : "mvn -B -pl apps/" + metadata.targetAppId + "/" + metadata.targetLayer + " -am verify");
  }

  reasons.sort((left, right) => left.code.localeCompare(right.code));
  warnings.sort((left, right) => left.code.localeCompare(right.code));
  requiredInputs.sort();
  validationCommands.sort();

  return {
    verdict: verdict,
    reasons: reasons,
    requiredInputs: requiredInputs,
    warnings: warnings,
    validationCommands: validationCommands,
  };
}

// ── Naming rules (port of basePackage.ts + the plan renderer) ─────────────

function sanitizeJavaSegment(input) {
  const cleaned = String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned.length === 0 ? "qa" : cleaned;
}

function toPascalCase(text) {
  return String(text)
    .split(/[\s\-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

const AUTHORING_GUIDANCE = {
  "web-desktop": { agent: "test-generator", prompt: "generate-web-test-from-scenario.md" },
  "web-mobile": { agent: "test-generator", prompt: "generate-web-test-from-scenario.md" },
  "mobile-appium": { agent: "test-generator", prompt: "generate-web-test-from-scenario.md" },
  android: { agent: "test-generator", prompt: "generate-web-test-from-scenario.md" },
  ios: { agent: "test-generator", prompt: "generate-web-test-from-scenario.md" },
  api: { agent: "api-test-generator", prompt: "generate-api-test.md" },
  integration: { agent: "integration-test-planner", prompt: "generate-api-test.md" },
  performance: { agent: "performance-analyst", prompt: "analyze-quality-impact-results.md" },
};

function authoringGuidance(root, layer) {
  const entry = AUTHORING_GUIDANCE[layer] || AUTHORING_GUIDANCE["web-desktop"];
  const agentPath = ".ai/agents/" + entry.agent + ".agent.md";
  const promptPath = ".ai/prompts/" + entry.prompt;
  const instructions = [".ai/instructions/locator-policy.md", ".ai/instructions/allure-step-policy.md"];
  const present = isFile(path.join(root, agentPath)) && isFile(path.join(root, promptPath));
  return { agent: agentPath, prompt: promptPath, instructions: instructions, present: present };
}

function authoringResolveContract(root, inlineValue, refValue, warnings, label) {
  if (inlineValue !== undefined && inlineValue !== null) {
    return inlineValue;
  }
  if (typeof refValue !== "string" || refValue.length === 0) {
    return undefined;
  }
  const target = safeResolve(root, refValue);
  if (!isFile(target)) {
    warnings.push(label + " reference not found: " + relPath(root, target));
    return undefined;
  }
  try {
    return readJsonFile(target);
  } catch (error) {
    warnings.push(label + " reference is not valid JSON: " + errorMessage(error));
    return undefined;
  }
}

function mcpSuggestTestImplementation(root, args) {
  const options = args || {};
  const warnings = [];

  const scenarioContract = authoringResolveContract(root, options.scenarioContract, options.scenarioContractRef, warnings, "scenarioContract");
  const testAuthoringRequest = authoringResolveContract(root, options.testAuthoringRequest, options.testAuthoringRequestRef, warnings, "testAuthoringRequest");
  const locatorEvidenceContract = authoringResolveContract(root, options.locatorEvidence, options.locatorEvidenceRef, warnings, "locatorEvidence");
  const allureStepMappingContract = authoringResolveContract(root, options.allureStepMapping, options.allureStepMappingRef, warnings, "allureStepMapping");

  const requestTarget = isRecord(testAuthoringRequest) && isRecord(testAuthoringRequest.target)
    ? testAuthoringRequest.target
    : {};
  const appId = [options.app, isRecord(scenarioContract) ? scenarioContract.appId : undefined, requestTarget.appId]
    .find((candidate) => typeof candidate === "string" && candidate.length > 0) || null;
  const layer = [options.layer, isRecord(scenarioContract) ? scenarioContract.layer : undefined, requestTarget.layer]
    .find((candidate) => typeof candidate === "string" && candidate.length > 0) || null;

  const lock = readLock(root);
  const blueprintId = lock.ok && typeof lock.data.blueprintId === "string" ? lock.data.blueprintId : undefined;
  const playwright = typeof blueprintId === "string" && blueprintId.startsWith("ts-");

  const readiness = evaluateAiAuthoringReadiness(
    {
      scenarioContract: scenarioContract,
      testAuthoringRequest: testAuthoringRequest,
      locatorEvidenceContract: locatorEvidenceContract,
      allureStepMappingContract: allureStepMappingContract,
    },
    { targetAppId: appId || undefined, targetLayer: layer || undefined, blueprint: blueprintId }
  );

  const lockApps = lock.ok && Array.isArray(lock.data.apps) ? lock.data.apps : [];
  const lockApp = lockApps.find((entry) => isRecord(entry) && entry.id === appId) || null;
  const projectName = lock.ok && typeof lock.data.projectName === "string" ? lock.data.projectName : null;

  let target = null;
  if (appId && layer && projectName) {
    // ts-* projects have no packages: specs live in apps/<id>/<layer>/tests/<Name>.spec.ts.
    const basePackage = playwright ? null : "com.example." + sanitizeJavaSegment(projectName);
    const testPackage = playwright ? null : basePackage + ".apps." + sanitizeJavaSegment(appId) + "." + sanitizeJavaSegment(layer);
    const title = isRecord(scenarioContract) && typeof scenarioContract.title === "string"
      ? scenarioContract.title
      : null;
    const pascalTitle = title === null ? null : toPascalCase(title);
    const validName = Boolean(pascalTitle && /^[A-Z][A-Za-z0-9]*$/.test(pascalTitle));
    const className = !validName ? null : playwright ? pascalTitle : pascalTitle + "Test";
    if (title !== null && className === null) {
      warnings.push(playwright
        ? "Scenario title does not yield a valid spec name; name the spec file yourself."
        : "Scenario title does not yield a valid Java class name; name the test class yourself.");
    }
    const moduleDir = "apps/" + appId + "/" + layer;
    target = {
      appId: appId,
      layer: layer,
      appInLock: lockApp !== null,
      layerInLock: lockApp !== null && Array.isArray(lockApp.layers) && lockApp.layers.indexOf(layer) >= 0,
      module: moduleDir,
      basePackage: basePackage,
      testPackage: testPackage,
      testClassName: className,
      testClassPath: className === null
        ? null
        : playwright
          ? moduleDir + "/tests/" + className + ".spec.ts"
          : moduleDir + "/src/test/java/" + testPackage.split(".").join("/") + "/" + className + ".java",
      testMethod: pascalTitle === null ? null : playwright ? title : "test" + pascalTitle,
    };
    if (lockApp === null) {
      warnings.push("App '" + appId + "' is not present in qa-factory.lock.json; add it with qaff add-app before implementing.");
    } else if (!target.layerInLock) {
      warnings.push("Layer '" + layer + "' is not enabled for app '" + appId + "'; add it with qaff add-layer before implementing.");
    }
  } else if (!projectName) {
    warnings.push("qa-factory.lock.json was not readable, so no target module or package could be derived.");
  }

  const payload = {
    status: "OK",
    tool: "suggest_test_implementation",
    $schema: "qaff/mcp-test-implementation-plan/v1",
    readiness: readiness,
    target: target,
    guidance: authoringGuidance(root, layer || "web-desktop"),
    warnings: warnings,
    notice: "This is an implementation plan, not generated code. No selectors, URLs or credentials were invented.",
    sideEffects: "none",
  };

  if (readiness.verdict !== "BLOCKED" && isRecord(scenarioContract)) {
    const mappings = isRecord(allureStepMappingContract) && Array.isArray(allureStepMappingContract.mappings)
      ? allureStepMappingContract.mappings
      : [];
    const expectedResults = Array.isArray(scenarioContract.expectedResults) ? scenarioContract.expectedResults : [];
    const steps = Array.isArray(scenarioContract.steps) ? scenarioContract.steps : [];
    payload.steps = steps.filter((step) => isRecord(step)).map((step) => {
      const stepId = typeof step.id === "string" ? step.id : null;
      const mapping = mappings.find((entry) => isRecord(entry) && entry.scenarioStepId === stepId);
      const action = typeof step.action === "string" ? step.action : null;
      return {
        stepId: stepId,
        action: action,
        allureStep: mapping && typeof mapping.allureStep === "string" ? mapping.allureStep : action,
        expectedResults: expectedResults
          .filter((entry) => isRecord(entry) && entry.stepId === stepId && typeof entry.result === "string")
          .map((entry) => entry.result),
      };
    });

    const pageOrComponent = isRecord(locatorEvidenceContract) && typeof locatorEvidenceContract.pageOrComponent === "string"
      ? locatorEvidenceContract.pageOrComponent
      : null;
    if (pageOrComponent && target) {
      const elements = Array.isArray(locatorEvidenceContract.elements) ? locatorEvidenceContract.elements : [];
      const className = toPascalCase(pageOrComponent) + "Page";
      payload.pageObjects = [{
        className: className,
        path: playwright
          ? target.module + "/pages/" + className + ".ts"
          : target.module + "/src/test/java/" + target.testPackage.split(".").join("/") + "/" + className + ".java",
        methods: elements
          .filter((element) => isRecord(element) && typeof element.name === "string")
          .map((element) => "get" + toPascalCase(element.name)),
        selectors: elements
          .filter((element) => isRecord(element) && typeof element.name === "string")
          .map((element) => ({
            name: element.name,
            candidateSelector: typeof element.candidateSelector === "string" ? element.candidateSelector : null,
          })),
      }];
    } else {
      payload.pageObjects = [];
    }

    payload.allure = isRecord(allureStepMappingContract)
      ? {
        feature: typeof allureStepMappingContract.feature === "string" ? allureStepMappingContract.feature : null,
        story: typeof allureStepMappingContract.story === "string" ? allureStepMappingContract.story : null,
        severity: typeof allureStepMappingContract.severity === "string" ? allureStepMappingContract.severity : null,
      }
      : null;
  }

  return payload;
}

async function callTool(name, args) {
  const root = repoRoot();
  if (args && typeof args.path === "string") {
    safeResolve(root, args.path);
  }
  if (args && typeof args.runRef === "string") {
    safeResolve(root, args.runRef);
  }
  if (args && typeof args.baselineRef === "string") {
    safeResolve(root, args.baselineRef);
  }
  if (args && typeof args.reportRef === "string") {
    safeResolve(root, args.reportRef);
  }
  if (args && typeof args.thresholdsRef === "string") {
    safeResolve(root, args.thresholdsRef);
  }
  for (const refKey of ["scenarioContractRef", "testAuthoringRequestRef", "locatorEvidenceRef", "allureStepMappingRef"]) {
    if (args && typeof args[refKey] === "string") {
      safeResolve(root, args[refKey]);
    }
  }

  if (name === "inspect_repository_structure") {
    const lock = readLock(root);
    if (!lock.ok) {
      return textPayload({ status: "ERROR", tool: name, message: lock.message, path: lock.path }, true);
    }
    const apps = Array.isArray(lock.data.apps) ? lock.data.apps.map((app) => ({ id: app.id, layers: app.layers || [] })) : [];
    return textPayload({
      status: "OK",
      tool: name,
      project: lock.data.projectName || null,
      blueprintId: lock.data.blueprintId || null,
      javaVersion: lock.data.javaVersion || null,
      packs: lock.data.packs || {},
      ci: lock.data.ci || {},
      apps,
    }, false);
  }

  if (name === "attach_report_to_jira") {
    const input = args || {};
    const httpUrl = /^https?:\/\/\S+$/i;
    const invalidFields = [];
    if (typeof input.issueKey !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/.test(input.issueKey)) {
      invalidFields.push("issueKey");
    }
    for (const key of ["runUrl", "reportUrl"]) {
      if (input[key] !== undefined && (typeof input[key] !== "string" || !httpUrl.test(input[key]))) {
        invalidFields.push(key);
      }
    }
    for (const key of ["app", "layer", "runRef", "comment"]) {
      if (input[key] !== undefined && typeof input[key] !== "string") {
        invalidFields.push(key);
      }
    }
    if (invalidFields.length > 0) {
      return textPayload({
        status: "INVALID_INPUT",
        tool: name,
        invalidFields,
        message: "issueKey must be a Jira issue key (e.g. DEMO-12) and runUrl / reportUrl http(s) URLs; nothing was written or sent.",
        sideEffects: "none",
      }, true);
    }
    const live = envTrue("JIRA_ENABLE_LIVE_WRITE");
    if (live) {
      const missing = missingEnv(["JIRA_BASE_URL", "JIRA_USER", "JIRA_TOKEN"]);
      if (missing.length > 0) {
        return textPayload({ status: "CREDENTIALS_REQUIRED", tool: name, missingEnv: missing, liveWriteEnabled: true, sideEffects: "none" }, true);
      }
    }
    const results = mcpReadTestResults(root, { app: input.app, layer: input.layer, runRef: input.runRef });
    if (results.status !== "OK") {
      return textPayload({ status: "ERROR", tool: name, message: results.message, sideEffects: "none" }, true);
    }
    const totals = { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0 };
    for (const app of results.apps) {
      for (const entry of app.layers) {
        if (entry.present) {
          for (const key of Object.keys(totals)) {
            totals[key] += entry.totals[key];
          }
        }
      }
    }
    const lock = readLock(root);
    const request = buildJiraCommentBody({
      project: lock.ok ? lock.data.projectName : undefined,
      app: input.app,
      totals,
      runUrl: input.runUrl,
      reportUrl: input.reportUrl,
      note: input.comment,
    });
    if (!live) {
      const outDir = path.join(root, ".ai", "mcp", "outbox");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, "jira-comment.request.json");
      fs.writeFileSync(outPath, JSON.stringify({ tool: name, mode: "dry-run", issueKey: input.issueKey, request }, null, 2) + "\n", "utf8");
      return textPayload({
        status: "DRY_RUN_WRITTEN",
        tool: name,
        outputRef: relPath(root, outPath),
        totals,
        liveWriteEnabled: false,
        sideEffects: "local_file_write",
      }, false);
    }
    // Jira Cloud REST API v3 — one comment, Basic auth with an Atlassian API token.
    // The token is never echoed; failures report the HTTP status and status text only.
    const auth = "Basic " + Buffer.from(envValue("JIRA_USER") + ":" + envValue("JIRA_TOKEN")).toString("base64");
    try {
      const response = await fetch(buildJiraCommentEndpoint(envValue("JIRA_BASE_URL"), input.issueKey), {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (response.ok) {
        return textPayload({ status: "LIVE_WRITE_OK", tool: name, liveWriteEnabled: true, httpStatus: response.status, totals, sideEffects: "jira_comment" }, false);
      }
      return textPayload({ status: "LIVE_WRITE_FAILED", tool: name, liveWriteEnabled: true, httpStatus: response.status, statusText: response.statusText, sideEffects: "none" }, true);
    } catch (error) {
      return textPayload({ status: "LIVE_WRITE_FAILED", tool: name, liveWriteEnabled: true, statusText: error instanceof Error ? error.name : "Error", sideEffects: "none" }, true);
    }
  }

  if (name === "create_zephyr_execution") {
    const invalidExecutions = zephyrInvalidExecutionIndexes(args || {});
    // Missing or empty executions: nothing to record, rejected like sync_xray_results / sync_testrail_results.
    const invalidFields = Array.isArray(args && args.executions) && args.executions.length > 0 ? [] : ["executions"];
    if (invalidFields.length > 0 || invalidExecutions.length > 0) {
      return textPayload({
        status: "INVALID_INPUT",
        tool: name,
        invalidFields,
        invalidExecutions,
        message: "executions must be a non-empty array; every execution needs a non-empty testCaseKey (or testKey) and status; nothing was written or sent.",
        sideEffects: "none",
      }, true);
    }
    if (!envTrue("ZEPHYR_ENABLE_LIVE_WRITE")) {
      const outputRef = writeZephyrDryRun(root, args || {});
      return textPayload({
        status: "DRY_RUN_WRITTEN",
        tool: name,
        outputRef,
        liveWriteEnabled: false,
        sideEffects: "local_file_write",
      }, false);
    }

    const missing = missingEnv(["ZEPHYR_BASE_URL", "ZEPHYR_TOKEN"]);
    if (missing.length > 0) {
      return textPayload({ status: "CREDENTIALS_REQUIRED", tool: name, missingEnv: missing, liveWriteEnabled: true, sideEffects: "none" }, true);
    }

    const token = envValue("ZEPHYR_TOKEN");
    // Zephyr Scale Cloud REST API v2 — the same per-execution requests the qaff CLI
    // sends (generator/src/integrations/zephyrScaleCloud.ts): one POST /v2/testexecutions each.
    const endpoint = buildZephyrScaleCloudEndpoint(envValue("ZEPHYR_BASE_URL"));
    const requests = zephyrRequestsFromArgs(args || {});
    const responses = [];
    const sideEffects = () => (responses.some((entry) => entry.ok) ? "zephyr_write" : "none");
    try {
      for (const request of requests) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: "Bearer " + token,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        });
        const bodyText = await response.text();
        responses.push({
          testCaseKey: request.testCaseKey,
          httpStatus: response.status,
          ok: response.ok,
          responseBody: bodyText.slice(0, 1000),
        });
      }
    } catch (error) {
      return textPayload({
        status: "NETWORK_ERROR",
        tool: name,
        liveWriteEnabled: true,
        endpoint,
        submitted: responses.length,
        responses,
        message: error instanceof Error ? error.message : String(error),
        sideEffects: sideEffects(),
      }, true);
    }
    const ok = responses.every((entry) => entry.ok);
    return textPayload({
      status: ok ? "LIVE_WRITE_OK" : "LIVE_WRITE_FAILED",
      tool: name,
      liveWriteEnabled: true,
      endpoint,
      submitted: requests.length,
      responses,
      sideEffects: sideEffects(),
    }, !ok);
  }

  if (name === "sync_xray_results" || name === "sync_testrail_results") {
    const input = args || {};
    const xray = name === "sync_xray_results";
    const keyFields = xray ? ["caseKey", "testKey"] : ["caseKey", "caseId"];
    const invalidFields = [];
    if (xray) {
      if (typeof input.projectKey !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(input.projectKey)) invalidFields.push("projectKey");
      if (input.testExecKey !== undefined && (typeof input.testExecKey !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/.test(input.testExecKey))) invalidFields.push("testExecKey");
    } else if (!/^[1-9]\d*$/.test(typeof input.runId === "number" || typeof input.runId === "string" ? String(input.runId) : "")) {
      invalidFields.push("runId");
    }
    if (input.app !== undefined && typeof input.app !== "string") invalidFields.push("app");
    // An empty import is rejected remotely (TestRail: HTTP 400), so it is invalid input here.
    if (!Array.isArray(input.executions) || input.executions.length === 0) invalidFields.push("executions");
    const invalidExecutions = resultInvalidExecutionIndexes(input, keyFields);
    if (invalidFields.length > 0 || invalidExecutions.length > 0) {
      return textPayload({
        status: "INVALID_INPUT",
        tool: name,
        invalidFields,
        invalidExecutions,
        message: (xray
          ? "projectKey must be a Jira project key (e.g. DEMO) and testExecKey an issue key (e.g. DEMO-12)"
          : "runId must be an existing TestRail run id (a positive integer)")
          + "; every execution needs " + keyFields.join(" or ") + " and an Allure status (" + RESULT_STATUSES.join(" / ") + "); nothing was written or sent.",
        sideEffects: "none",
      }, true);
    }
    const live = envTrue(xray ? "XRAY_ENABLE_LIVE_WRITE" : "TESTRAIL_ENABLE_LIVE_WRITE");
    if (live) {
      const required = xray
        ? ["XRAY_CLIENT_ID", "XRAY_CLIENT_SECRET", ...(envValue("XRAY_BASE_URL") ? ["XRAY_BASE_URL"] : [])]
        : ["TESTRAIL_URL", "TESTRAIL_USER", "TESTRAIL_API_KEY"];
      const missing = missingLiveEnv(required);
      if (missing.length > 0) {
        return textPayload({ status: "CREDENTIALS_REQUIRED", tool: name, missingEnv: missing, liveWriteEnabled: true, sideEffects: "none" }, true);
      }
    }
    const mapped = mappedFromArgs(input, keyFields);
    let target;
    let request;
    let warnings;
    if (xray) {
      const lock = readLock(root);
      target = { projectKey: input.projectKey, ...(input.testExecKey ? { testExecKey: input.testExecKey } : {}) };
      request = buildXrayImportRequest(mapped, {
        projectKey: input.projectKey,
        testExecKey: input.testExecKey,
        scope: [lock.ok ? lock.data.projectName : undefined, input.app].filter(Boolean).join("/") || "allure-results",
      });
      warnings = [];
    } else {
      target = { runId: Number(input.runId) };
      const built = buildTestRailResultsRequest(mapped);
      request = built.request;
      warnings = built.warnings;
    }
    if (!live) {
      const outputRef = writeOutbox(root, xray ? "xray-import.request.json" : "testrail-results.request.json", { tool: name, mode: "dry-run", target, request, warnings });
      return textPayload({ status: "DRY_RUN_WRITTEN", tool: name, outputRef, target, warnings, liveWriteEnabled: false, sideEffects: "local_file_write" }, false);
    }
    // Secrets come from env only and are never echoed; failures report the HTTP status
    // and status text only (response bodies can carry tokens or account details).
    try {
      let response;
      if (xray) {
        const base = trimTrailingSlashes(envValue("XRAY_BASE_URL") || XRAY_DEFAULT_BASE_URL);
        const auth = await postJson(base + "/api/v2/authenticate", {}, { client_id: envValue("XRAY_CLIENT_ID"), client_secret: envValue("XRAY_CLIENT_SECRET") });
        if (!auth.ok) {
          return textPayload({ status: "LIVE_WRITE_FAILED", tool: name, liveWriteEnabled: true, step: "authenticate", httpStatus: auth.status, statusText: auth.statusText, sideEffects: "none" }, true);
        }
        // The token comes back as a JSON string literal; it is used once and never kept.
        const raw = (await auth.text()).trim();
        const token = raw.startsWith('"') ? JSON.parse(raw) : raw;
        response = await postJson(base + "/api/v2/import/execution", { authorization: "Bearer " + token }, request);
      } else {
        const basic = "Basic " + Buffer.from(envValue("TESTRAIL_USER") + ":" + envValue("TESTRAIL_API_KEY")).toString("base64");
        response = await postJson(buildTestRailEndpoint(envValue("TESTRAIL_URL"), target.runId), { authorization: basic }, request);
      }
      if (response.ok) {
        return textPayload({ status: "LIVE_WRITE_OK", tool: name, liveWriteEnabled: true, httpStatus: response.status, target, warnings, sideEffects: xray ? "xray_import" : "testrail_results" }, false);
      }
      return textPayload({ status: "LIVE_WRITE_FAILED", tool: name, liveWriteEnabled: true, ...(xray ? { step: "import" } : {}), httpStatus: response.status, statusText: response.statusText, sideEffects: "none" }, true);
    } catch (error) {
      // Network errors can embed the URL; report the error name only.
      return textPayload({ status: "LIVE_WRITE_FAILED", tool: name, liveWriteEnabled: true, statusText: error instanceof Error ? error.name : "Error", sideEffects: "none" }, true);
    }
  }

  if (name === "compare_performance_baseline") {
    const payload = qiComparePerformanceBaseline(root, args || {});
    return textPayload(payload, payload.status !== "OK");
  }

  if (name === "read_test_results") {
    const payload = mcpReadTestResults(root, args || {});
    return textPayload(payload, payload.status !== "OK");
  }

  if (name === "suggest_test_implementation") {
    const payload = mcpSuggestTestImplementation(root, args || {});
    return textPayload(payload, payload.status !== "OK");
  }

  return textPayload({ status: "UNKNOWN_TOOL", tool: name }, true);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return jsonRpcError(null, -32600, "Invalid request.");
  }
  if (message.id === undefined) {
    return null;
  }
  if (message.method === "initialize") {
    const requested = message.params && message.params.protocolVersion;
    // Echo a supported requested version; otherwise answer with the oldest one
    // so any client can still proceed (spec: server may reply with a version it supports).
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1];
    return jsonRpcResult(message.id, {
      protocolVersion: protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "qaff-local-mcp", version: SERVER_VERSION },
    });
  }
  if (message.method === "ping") {
    return jsonRpcResult(message.id, {});
  }
  if (message.method === "tools/list") {
    return jsonRpcResult(message.id, { tools: TOOLS });
  }
  if (message.method === "tools/call") {
    const params = message.params || {};
    if (typeof params.name !== "string") {
      return jsonRpcError(message.id, -32602, "tools/call requires params.name.");
    }
    return jsonRpcResult(message.id, await callTool(params.name, params.arguments || {}));
  }
  return jsonRpcError(message.id, -32601, "Method not found: " + message.method);
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

if (process.argv.includes("--list-tools")) {
  process.stdout.write(JSON.stringify({ tools: TOOLS }, null, 2) + "\n");
  process.exit(0);
}

// Self-test runs entirely in memory on inline fixtures: no filesystem reads, no
// timestamps, no network. It proves the ported evaluators still behave, which is
// what makes the tools trustworthy offline.
function selfTestChecks() {
  const checks = [];
  const record = (checkName, run) => {
    let ok = false;
    try {
      ok = run() === true;
    } catch (error) {
      ok = false;
    }
    checks.push({ name: checkName, ok: ok });
  };

  record("yaml-subset", () => {
    const parsed = parseYamlSubset("version: 1\nstatus: advisory\ndefaults:\n  smoke:\n    metrics:\n      errorRate:\n        percent:\n          max: 0.0\n");
    return parsed.version === 1
      && parsed.status === "advisory"
      && parsed.defaults.smoke.metrics.errorRate.percent.max === 0;
  });

  record("allure-summary", () => {
    const warnings = [];
    const test = allureParseResultFile(
      "001-result.json",
      JSON.stringify({ uuid: "t1", name: "Sign in", status: "failed", start: 10, stop: 40, statusDetails: { message: "expected true" }, steps: [{ name: "Submit", status: "failed" }] }),
      warnings
    );
    return test.status === "failed"
      && test.durationMs === 30
      && test.failureCategory === "assertion_failure"
      && allureCollectFailedStepNames(test.steps, []).length === 1
      && warnings.length === 0;
  });

  record("threshold-evaluation", () => {
    const thresholds = { version: 1, status: "advisory", enforcement: "none", appliesTo: "provider-neutral", defaults: { smoke: { metrics: { errorRate: { percent: { max: 1 } } } } } };
    const result = { $schema: "qaff/performance-result/v1", app: "demo-saas", scenario: "smoke", level: "smoke", metrics: { errorRate: { percent: 0 } } };
    return evaluateThresholdModel(thresholds, result).verdict === "PASS";
  });

  record("baseline-comparison", () => {
    const baseline = { $schema: "qaff/performance-baseline/v1", app: "demo-saas", scenarios: { smoke: { metrics: { p50_response_ms: 10, p95_response_ms: 20, p99_response_ms: 30, error_rate_pct: 0, throughput_rps: 50 } } } };
    const result = { $schema: "qaff/performance-result/v1", app: "demo-saas", scenario: "smoke", level: "smoke", metrics: { responseTime: { p50Ms: 10, p95Ms: 999, p99Ms: 30 }, errorRate: { percent: 0 }, throughput: { requestsPerSecond: 50 } } };
    return evaluateBaselineModel(baseline, result).verdict === "REGRESSION";
  });

  record("authoring-readiness", () => {
    const readiness = evaluateAiAuthoringReadiness({}, {});
    const codes = readiness.reasons.map((reason) => reason.code);
    return readiness.verdict === "BLOCKED"
      && codes.indexOf("SCENARIO_CONTRACT_INVALID_OR_MISSING") >= 0
      && codes.indexOf("REQUEST_CONTRACT_INVALID_OR_MISSING") >= 0;
  });

  return checks;
}

if (process.argv.includes("--self-test")) {
  const names = TOOLS.map((tool) => tool.name);
  const expected = ["read_test_results", "compare_performance_baseline", "attach_report_to_jira", "create_zephyr_execution", "sync_xray_results", "sync_testrail_results", "inspect_repository_structure", "suggest_test_implementation"];
  const toolsOk = expected.length === names.length && expected.every((name) => names.includes(name));
  const checks = selfTestChecks();
  const ok = toolsOk && checks.every((check) => check.ok);
  process.stdout.write(JSON.stringify({ status: ok ? "PASSED" : "FAILED", tools: names, checks: checks }, null, 2) + "\n");
  process.exit(ok ? 0 : 1);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }
  Promise.resolve()
    .then(async () => handleMessage(JSON.parse(line)))
    .then((response) => {
      if (response) {
        writeJson(response);
      }
    })
    .catch((error) => {
      writeJson(jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)));
    });
});
