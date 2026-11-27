import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadConfig } from "../src/load-config.ts";

const rootFile = "frontspan.config.json";
const resourceFile = "frontspan/resources/z-orders.json";
const endpointFile = "frontspan/endpoints/my-files/z-list.json";
const environmentFile = "frontspan/environments/dev.json";
const roots = [];
const env = (name) => ({ kind: "env", name });

const root = {
  $schema: "https://schemas.example.invalid/frontspan/root.json",
  schemaVersion: 1,
  project: { name: "synthetic-store" },
  modules: { codegen: true, bff: true, query: true },
};
const orders = {
  schemaVersion: 1,
  id: "orders",
  kind: "http",
  contract: { kind: "file", path: "frontspan/contracts/orders.json" },
  upstream: {
    baseUrl: env("ORDERS_UPSTREAM"),
    auth: { kind: "forward", adapterId: "fake-session" },
  },
};
const catalog = {
  ...orders,
  id: "catalog",
  contract: {
    kind: "url",
    url: { kind: "literal", value: "https://catalog.example.invalid/openapi" },
  },
  upstream: { baseUrl: env("CATALOG_UPSTREAM") },
  direct: {
    allowed: true,
    publicBaseUrl: { kind: "literal", value: "https://public.example.invalid" },
  },
};
const list = {
  schemaVersion: 1,
  id: "orders.list",
  resourceId: "orders",
  source: { method: "GET", path: "/orders/{customer}" },
  domain: "orders",
  name: "listOrders",
  execution: {
    mode: "proxy",
    method: "GET",
    path: "/api/frontspan/orders/{customer}",
  },
  response: {
    kind: "paginated",
    mapping: {
      items: "/result/items",
      page: "/page",
      pageSize: "/size",
      totalCount: "/total",
    },
  },
};
const detail = {
  ...list,
  id: "catalog.detail",
  resourceId: "catalog",
  source: { method: "GET", path: "/products/{id}" },
  domain: "catalog",
  name: "getProduct",
  execution: { mode: "direct" },
  response: { kind: "data", mapping: { data: "/payload" } },
};
const development = {
  schemaVersion: 1,
  name: "development",
  resources: { orders: { upstream: { baseUrl: env("DEV_UPSTREAM") } } },
  endpoints: { "orders.list": { policies: { timeoutMs: 6000 } } },
};

async function temporary() {
  const dir = await mkdtemp(join(tmpdir(), "frontspan-config-test-"));
  roots.push(dir);
  return dir;
}

async function put(dir, path, value) {
  const file = join(dir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    typeof value === "string" || value instanceof Uint8Array
      ? value
      : JSON.stringify(value),
  );
}

async function project(files = []) {
  const dir = await temporary();
  await put(dir, rootFile, root);
  for (const [path, contents] of files) await put(dir, path, contents);
  return dir;
}

async function fails(dir, code, document, pointer) {
  const result = await loadConfig(dir);
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({ code, document, pointer, severity: "error" }),
  ]);
  return result.diagnostics[0];
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

test("loads authored documents deterministically, without reading the contracts, IDE schema or environment", async () => {
  const files = [
    [resourceFile, orders],
    ["frontspan/resources/a-not-identity.json", catalog],
    [endpointFile, list],
    ["frontspan/endpoints/my-files/a-detail.json", detail],
    [environmentFile, development],
    [orders.contract.path, "not JSON: this loader must not parse contracts"],
  ];
  const first = await project(files);
  const second = await project([...files].reverse());
  const result = await loadConfig(first);
  expect(result).toEqual(await loadConfig(second));
  expect(result.ok).toBe(true);
  const config = result.config;
  expect(config.resources.map(({ value }) => value.id)).toEqual([
    "catalog",
    "orders",
  ]);
  expect(config.endpoints.map(({ value }) => value.id)).toEqual([
    "catalog.detail",
    "orders.list",
  ]);
  expect(config.root.file).toBe(rootFile);
  expect(config.paths.generated).toBe("src/generated");
  expect(
    config.environments[0].value.resources.orders.upstream.baseUrl,
  ).toEqual(env("DEV_UPSTREAM"));
  expect(config.resources[1].value.upstream.baseUrl).toEqual(
    env("ORDERS_UPSTREAM"),
  );
  expect(Object.isFrozen(config.resources[1].value.upstream.baseUrl)).toBe(
    true,
  );
  expect(await readFile(join(first, rootFile), "utf8")).toBe(
    JSON.stringify(root),
  );
});

test("supports explicit nonoverlapping input and output locations", async () => {
  const dir = await project([
    ["config/resources/anything.json", orders],
    ["config/operations/catalog/anything.json", list],
  ]);
  await put(dir, rootFile, {
    ...root,
    paths: {
      resources: "config/resources",
      endpoints: "config/operations",
      generated: "src/owned",
    },
  });
  const result = await loadConfig(dir);
  expect(result.ok).toBe(true);
  expect(result.config.paths.generated).toBe("src/owned");
  expect(result.config.endpoints[0].value.id).toBe(list.id);
});

test("preserves the exact upstream path independently of the generated proxy route", async () => {
  const source = { ...list.source, path: "/orders/section%23one/{customer}/" };
  const dir = await project([
    [resourceFile, orders],
    [endpointFile, { ...list, source }],
  ]);
  const result = await loadConfig(dir);
  expect(result.ok).toBe(true);
  expect(result.config.endpoints[0].value.source.path).toBe(source.path);
});

test.each([
  [
    "duplicate root key",
    '{"schemaVersion":1,"schema\\u0056ersion":1}',
    "CFG_DUPLICATE_KEY",
    "",
  ],
  [
    "prototype key",
    '{"schemaVersion":1,"project":{"name":"demo","constructor":"placeholder"}}',
    "CFG_FORBIDDEN_KEY",
    "",
  ],
  [
    "unknown version",
    JSON.stringify({ ...root, schemaVersion: 2 }),
    "CFG_UNKNOWN_VERSION",
    "/schemaVersion",
  ],
  [
    "malformed version",
    JSON.stringify({ ...root, schemaVersion: null }),
    "CFG_SCHEMA_INVALID",
    "/schemaVersion",
  ],
  [
    "a fraction that rounds to version 1",
    '{"schemaVersion":1.00000000000000001,"project":{"name":"demo"}}',
    "CFG_INVALID_JSON",
    "",
  ],
  [
    "missing version",
    JSON.stringify({ project: root.project }),
    "CFG_SCHEMA_INVALID",
    "/schemaVersion",
  ],
  [
    "unknown field",
    JSON.stringify({ ...root, unexpected: "redact-me" }),
    "CFG_SCHEMA_INVALID",
    "",
  ],
  ["invalid UTF-8", new Uint8Array([255]), "CFG_INVALID_JSON", ""],
  ["oversized file", " ".repeat(256 * 1024 + 1), "CFG_LIMIT_EXCEEDED", ""],
])("rejects %s", async (_label, content, code, pointer) => {
  const dir = await project();
  await put(dir, rootFile, content);
  const diagnostic = await fails(dir, code, "root", pointer);
  expect(JSON.stringify(diagnostic)).not.toMatch(/redact-me|placeholder/);
});

test.each([
  [
    "unknown endpoint field",
    [
      [resourceFile, orders],
      [endpointFile, { ...list, runtimeCode: "placeholder" }],
    ],
    "CFG_SCHEMA_INVALID",
    "endpoint",
    "",
  ],
  [
    "missing resource",
    [[endpointFile, list]],
    "CFG_MISSING_RESOURCE",
    "endpoint",
    "/resourceId",
  ],
  [
    "duplicate resource ID",
    [
      [resourceFile, orders],
      ["frontspan/resources/a.json", orders],
    ],
    "CFG_DUPLICATE_ID",
    "resource",
    "/id",
  ],
  [
    "duplicate endpoint ID",
    [
      [resourceFile, orders],
      [endpointFile, list],
      ["frontspan/endpoints/my-files/a.json", list],
    ],
    "CFG_DUPLICATE_ID",
    "endpoint",
    "/id",
  ],
  [
    "duplicate environment name",
    [
      [resourceFile, orders],
      [endpointFile, list],
      [environmentFile, development],
      ["frontspan/environments/z.json", development],
    ],
    "CFG_DUPLICATE_ID",
    "environment",
    "/name",
  ],
  [
    "unknown environment target",
    [[environmentFile, development]],
    "CFG_MISSING_RESOURCE",
    "environment",
    "/resources",
  ],
  [
    "unknown env endpoint",
    [
      [resourceFile, orders],
      [environmentFile, development],
    ],
    "CFG_MISSING_ENDPOINT",
    "environment",
    "/endpoints",
  ],
  [
    "unknown environment field",
    [[environmentFile, { ...development, modules: {} }]],
    "CFG_SCHEMA_INVALID",
    "environment",
    "",
  ],
  [
    "unapproved auth fields",
    [
      [
        resourceFile,
        {
          ...orders,
          upstream: {
            ...orders.upstream,
            auth: {
              kind: "forward",
              adapterId: "synthetic",
              token: "test-only",
            },
          },
        },
      ],
    ],
    "CFG_SCHEMA_INVALID",
    "resource",
    "/upstream/auth",
  ],
  [
    "credentialed base URL",
    [
      [
        resourceFile,
        {
          ...orders,
          upstream: {
            baseUrl: {
              kind: "literal",
              value: "https://fixture:synthetic-secret@example.invalid/path",
            },
          },
        },
      ],
    ],
    "CFG_INVALID_URL",
    "resource",
    "/upstream/baseUrl",
  ],
  [
    "private env ref reused in direct URL",
    [
      [
        resourceFile,
        {
          ...catalog,
          direct: { allowed: true, publicBaseUrl: catalog.upstream.baseUrl },
        },
      ],
    ],
    "CFG_DIRECT_NOT_ALLOWED",
    "resource",
    "/direct/publicBaseUrl",
  ],
  [
    "direct mode disabled",
    [
      [resourceFile, { ...catalog, direct: { allowed: false } }],
      [endpointFile, detail],
    ],
    "CFG_DIRECT_NOT_ALLOWED",
    "endpoint",
    "/execution",
  ],
  [
    "invalid JSON pointer",
    [
      [resourceFile, catalog],
      [
        endpointFile,
        {
          ...detail,
          response: { kind: "data", mapping: { data: "/wrong~3" } },
        },
      ],
    ],
    "CFG_SCHEMA_INVALID",
    "endpoint",
    "/response/mapping/data",
  ],
  [
    "route parameter differs",
    [
      [resourceFile, orders],
      [
        endpointFile,
        {
          ...list,
          execution: {
            ...list.execution,
            path: "/api/frontspan/orders/{other}",
          },
        },
      ],
    ],
    "CFG_INVALID_ROUTE",
    "endpoint",
    "/execution/path",
  ],
  [
    "route destination structural collision",
    [
      [resourceFile, orders],
      [endpointFile, list],
      [
        "frontspan/endpoints/my-files/zz.json",
        {
          ...list,
          id: "orders.latest",
          name: "latestOrders",
          source: { method: "GET", path: "/orders/latest" },
          execution: {
            mode: "proxy",
            method: "GET",
            path: "/api/frontspan/orders/latest",
          },
        },
      ],
    ],
    "CFG_ROUTE_COLLISION",
    "endpoint",
    "/execution/path",
  ],
  [
    "reserved generated name",
    [
      [resourceFile, orders],
      [endpointFile, { ...list, name: "class" }],
    ],
    "CFG_INVALID_NAME",
    "endpoint",
    "/name",
  ],
  [
    "unknown config file",
    [["frontspan/resources/unexpected.yaml", "placeholder"]],
    "CFG_UNKNOWN_FILE",
    "resource",
    "",
  ],
])("rejects %s", async (_label, files, code, document, pointer) => {
  const dir = await project(files);
  const diag = await fails(dir, code, document, pointer);
  expect(JSON.stringify(diag)).not.toMatch(
    /synthetic-secret|test-only|placeholder|example\.invalid/,
  );
});

test.each([
  "../outside",
  "/absolute",
  "C:/outside",
  "\\\\outside\\resources",
  "a/../resources",
  "a//b",
  "a/./b",
  "a/NUL",
  "a/trailing.",
  "SRC/GENERATED/nested",
  "frontspan/endpoints/nested",
  "frontspan/frontspan.lock.json",
  "bad-\ud800-path",
])("rejects invalid or overlapping module path %s", async (path) => {
  const dir = await project();
  await put(dir, rootFile, { ...root, paths: { resources: path } });
  const result = await loadConfig(dir);
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0].code).toBe("CFG_INVALID_PATH");
});

test("does not accept the tracked lockfile as a source contract", async () => {
  const dir = await project([
    [
      resourceFile,
      {
        ...orders,
        contract: { kind: "file", path: "frontspan/frontspan.lock.json" },
      },
    ],
  ]);
  await fails(dir, "CFG_INVALID_PATH", "resource", "/contract/path");
});

test("rejects symlinked config roots, documents, output paths and contract inputs", async () => {
  const outside = await temporary();
  await put(outside, "orders.json", orders);
  for (const [path, target, document, pointer] of [
    ["frontspan/resources", outside, "root", "/paths/resources"],
    [resourceFile, join(outside, "orders.json"), "resource", ""],
    ["src/generated", outside, "root", "/paths/generated"],
    [
      orders.contract.path,
      join(outside, "orders.json"),
      "resource",
      "/contract/path",
    ],
    ["frontspan/endpoints/link", outside, "endpoint", ""],
  ]) {
    const dir = await project(
      path === orders.contract.path ? [[resourceFile, orders]] : [],
    );
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await symlink(target, join(dir, path));
    await fails(dir, "CFG_INVALID_PATH", document, pointer);
  }
});

test("requires codegen for query and validation, and bff for proxy", async () => {
  for (const [moduleName, moduleFlags] of [
    ["query", { query: true }],
    ["validation", { validation: true }],
  ]) {
    const dir = await project();
    await put(dir, rootFile, { ...root, modules: moduleFlags });
    await fails(dir, "CFG_MODULE_REQUIRED", "root", `/modules/${moduleName}`);
  }
  const dir = await project([
    [resourceFile, orders],
    [endpointFile, list],
  ]);
  await put(dir, rootFile, { ...root, modules: { codegen: true } });
  await fails(dir, "CFG_MODULE_REQUIRED", "endpoint", "/execution");
});
