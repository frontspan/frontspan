import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadConfig, loadEffectiveConfig } from "../src/load-config.ts";

const pin = { package: "catalog-preset", version: "1.0.0" };
const directory = "node_modules/catalog-preset";
const file = "frontspan-preset.json";
let root;
const put = (path, value) => writeFile(join(root, path), JSON.stringify(value));
const authored = {
  schemaVersion: 1,
  project: { name: "synthetic" },
  presets: [pin],
  modules: { bff: true },
};
const approved = {
  schemaVersion: 1,
  defaults: { timeoutMs: 8000 },
  policy: { maxTimeoutMs: 10000 },
};
// The expected digest is derived from this separate fixture source, never read from disk.
function evidence(document = approved) {
  return [
    {
      ...pin,
      packageDirectory: directory,
      expectedDigest:
        "sha256:" +
        createHash("sha256").update(JSON.stringify(document)).digest("hex"),
    },
  ];
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "frontspan-cfg02-"));
  for (const dir of [
    directory,
    "frontspan/resources",
    "frontspan/endpoints/catalog",
    "frontspan/environments",
  ])
    await mkdir(join(root, dir), { recursive: true });
  await put("frontspan.config.json", authored);
  await put(directory + "/package.json", {
    name: pin.package,
    version: pin.version,
    exports: { "./frontspan-preset.json": "./frontspan-preset.json" },
  });
  await put(directory + "/" + file, approved);
  await put("frontspan/resources/catalog.json", {
    schemaVersion: 1,
    id: "catalog",
    kind: "http",
    contract: { kind: "file", path: "contracts/catalog.json" },
    upstream: { baseUrl: { kind: "env", name: "CATALOG_URL" } },
  });
  await put("frontspan/endpoints/catalog/list.json", {
    schemaVersion: 1,
    id: "catalog.list",
    resourceId: "catalog",
    domain: "catalog",
    name: "listCatalog",
    source: { method: "GET", path: "/items" },
    execution: { mode: "proxy", method: "GET", path: "/api/frontspan/items" },
    response: { kind: "data" },
  });
  await put("frontspan/environments/dev.json", {
    schemaVersion: 1,
    name: "dev",
    endpoints: { "catalog.list": { policies: { timeoutMs: 6000 } } },
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function error(result, code) {
  expect(result).toMatchObject({ ok: false, diagnostics: [{ code }] });
  expect(result).not.toHaveProperty("config");
}
test("CFG-02: installed bytes, policy, profile and provenance through the public loader", async () => {
  const options = { evidence: evidence() };
  const base = await loadEffectiveConfig(root, options);
  expect(base.config.endpoints[0]).toMatchObject({
    policies: { timeoutMs: 8000 },
    provenance: { timeoutMs: "preset:0" },
  });
  const dev = await loadEffectiveConfig(root, {
    ...options,
    environmentProfile: "dev",
  });
  expect(dev.config.endpoints[0]).toMatchObject({
    policies: { timeoutMs: 6000 },
    provenance: { timeoutMs: "profile.endpoint" },
  });
  error(
    await loadEffectiveConfig(root, {
      ...options,
      profile: "dev",
      environmentProfile: "other",
    }),
    "CFG_PROFILE_INVALID",
  );
  error(
    await loadEffectiveConfig(root, { ...options, profile: "missing" }),
    "CFG_PROFILE_INVALID",
  );
  await put("frontspan/environments/dev.json", {
    schemaVersion: 1,
    name: "dev",
    endpoints: { "catalog.list": { policies: { timeoutMs: 12000 } } },
  });
  error(await loadEffectiveConfig(root, options), "CFG_POLICY_VIOLATION");
});
test("CFG-02: missing evidence, missing required pin or same-version replacement cannot produce effective config", async () => {
  error(await loadEffectiveConfig(root), "CFG_PRESET_EVIDENCE");
  error(
    await loadEffectiveConfig(root, { evidence: [] }),
    "CFG_PRESET_EVIDENCE",
  );
  await put(directory + "/" + file, { ...approved, policy: {} });
  expect((await loadConfig(root)).ok).toBe(true);
  error(
    await loadEffectiveConfig(root, { evidence: evidence() }),
    "CFG_PRESET_INTEGRITY",
  );
  await put("frontspan.config.json", { ...authored, presets: [] });
  error(
    await loadEffectiveConfig(root, { evidence: evidence() }),
    "CFG_PRESET_EVIDENCE",
  );
});
test.each([
  { schemaVersion: 2, defaults: {}, policy: {} },
  { defaults: {}, policy: {} },
  { ...approved, endpoints: [] },
  { ...approved, defaults: { rawToken: "synthetic-sensitive" } },
  { ...approved, policy: { maxRetries: -1 } },
  { ...approved, policy: { allowedExecutionModes: ["custom"] } },
  { ...approved, policy: { allowedPublicEnvNames: ["${SENSITIVE}"] } },
])(
  "CFG-02: valid digest does not authorize malformed preset data",
  async (bad) => {
    await put(directory + "/" + file, bad);
    const result = await loadEffectiveConfig(root, { evidence: evidence(bad) });
    error(result, "CFG_PRESET_INVALID");
    expect(JSON.stringify(result)).not.toContain("synthetic-sensitive");
  },
);
test.each([
  { direct: { allowed: true } },
  { upstream: { baseUrl: { kind: "env", name: "invalid-name" } } },
  { upstream: { baseUrl: { kind: "secret", value: "synthetic-sensitive" } } },
])(
  "CFG-02: forbidden profile changes and invalid references never reach effective output",
  async (override) => {
    await put("frontspan/environments/dev.json", {
      schemaVersion: 1,
      name: "dev",
      resources: { catalog: override },
    });
    const result = await loadEffectiveConfig(root, { evidence: evidence() });
    error(result, "CFG_SCHEMA_INVALID");
    expect(JSON.stringify(result)).not.toContain("synthetic-sensitive");
  },
);
