import { expect, test, vi } from "vitest";
import { evaluatePolicy, PolicyError } from "../src/effective-policy.ts";

const env = (name) => ({ kind: "env", name });
const doc = (value) => ({
  file: "not-a-provenance-source.json",
  value: { schemaVersion: 1, ...value },
});
const preset = (policy = {}, defaults = {}) => ({
  schemaVersion: 1,
  defaults,
  policy,
});
const profile = (name, overrides) => doc({ name, ...overrides });
function fixture() {
  return {
    root: doc({
      project: { name: "synthetic" },
      modules: { bff: true, codegen: true, validation: true },
    }),
    paths: {
      resources: "r",
      endpoints: "e",
      environments: "p",
      generated: "g",
    },
    resources: [
      doc({
        id: "catalog",
        kind: "http",
        contract: { kind: "file", path: "contracts/catalog.json" },
        upstream: { baseUrl: env("PRIVATE_CATALOG") },
      }),
    ],
    endpoints: [
      doc({
        id: "catalog.list",
        resourceId: "catalog",
        domain: "catalog",
        name: "listCatalog",
        source: { method: "GET", path: "/items" },
        execution: {
          mode: "proxy",
          method: "GET",
          path: "/api/frontspan/items",
        },
        response: { kind: "data" },
      }),
    ],
    environments: [],
  };
}
function fails(fn, code = "CFG_POLICY_VIOLATION") {
  expect(fn).toThrow(PolicyError);
  expect(fn).toThrow(
    expect.objectContaining({
      code,
      message:
        code === "CFG_PROFILE_INVALID"
          ? "Invalid profile."
          : "Effective policy violation.",
    }),
  );
}

test("ordinary values inherit independently and identify the winning layer", () => {
  const c = fixture();
  const presets = [];
  const check = (value, layer, profileName) => {
    const result = evaluatePolicy(c, presets, profileName);
    expect(result.profile).toBe(profileName ?? null);
    expect(result.endpoints[0]).toMatchObject({
      executionMode: "proxy",
      policies: { timeoutMs: value },
      provenance: { timeoutMs: layer, executionMode: "endpoint" },
    });
    return result.endpoints[0];
  };
  expect(check(15000, "builtin").policies).toEqual({
    timeoutMs: 15000,
    retries: 0,
    validation: "strict",
  });
  presets.push(preset({}, { timeoutMs: 14000, validation: "warn" }));
  check(14000, "preset:0");
  presets.push(preset({}, { timeoutMs: 13000 }));
  check(13000, "preset:1");
  c.root.value.defaults = { timeoutMs: 12000, execution: "direct", retries: 1 };
  check(12000, "root");
  c.resources[0].value.defaults = { timeoutMs: 11000 };
  check(11000, "resource");
  c.endpoints[0].value.policies = { timeoutMs: 10000 };
  check(10000, "endpoint");
  const dev = profile("dev", {
    resources: { catalog: { defaults: { timeoutMs: 9000 } } },
  });
  c.environments.push(dev);
  check(9000, "profile.resource", "dev");
  dev.value.endpoints = { "catalog.list": { policies: { timeoutMs: 8000 } } };
  expect(check(8000, "profile.endpoint", "dev")).toMatchObject({
    policies: { retries: 1, validation: "warn" },
    provenance: { retries: "root", validation: "preset:0" },
  });
  check(10000, "endpoint");
});

test("hard constraints accumulate independently of ordinary defaults", () => {
  const c = fixture();
  const presets = [
    preset({
      maxTimeoutMs: 15000,
      maxRetries: 2,
      allowedExecutionModes: ["proxy"],
      deniedMethods: ["DELETE"],
      requireStrictValidation: true,
      allowedPublicEnvNames: ["SHARED", "FIRST"],
    }),
    preset({
      maxTimeoutMs: 30000,
      maxRetries: 0,
      allowedExecutionModes: ["direct", "proxy"],
      deniedMethods: ["DELETE", "POST"],
      requireStrictValidation: false,
      allowedPublicEnvNames: ["SECOND", "SHARED"],
    }),
  ];
  const result = evaluatePolicy(c, presets);
  expect(result.policy).toEqual({
    maxTimeoutMs: 15000,
    maxRetries: 0,
    allowedExecutionModes: ["proxy"],
    deniedMethods: ["DELETE", "POST"],
    requireStrictValidation: true,
    allowedPublicEnvNames: ["SHARED"],
  });
  for (const sources of Object.values(result.policyProvenance))
    expect(sources).toEqual(["preset:0", "preset:1"]);
  for (const policies of [
    { timeoutMs: 15001 },
    { retries: 1 },
    { validation: "warn" },
  ]) {
    c.endpoints[0].value.policies = policies;
    fails(() => evaluatePolicy(c, presets));
  }
  delete c.endpoints[0].value.policies;
  c.root.value.modules.validation = false;
  fails(() => evaluatePolicy(c, presets));
});

test("rejects disjoint modes even without endpoints, denied methods, and missing or disallowed persisted execution", () => {
  const c = fixture();
  const withModes = (modes) => preset({ allowedExecutionModes: modes });
  fails(() =>
    evaluatePolicy({ ...c, endpoints: [] }, [
      withModes(["direct"]),
      withModes(["proxy"]),
    ]),
  );
  fails(() => evaluatePolicy(c, [preset({ deniedMethods: ["GET"] })]));
  c.root.value.defaults = { execution: "direct" };
  fails(() => evaluatePolicy(c, [withModes(["direct"])]));
  delete c.endpoints[0].value.execution;
  fails(() => evaluatePolicy(c, []));
});

test("validates base and every profile, including resource-wide overrides partially shadowed by endpoints", () => {
  const c = fixture();
  const caps = [preset({ maxTimeoutMs: 15000, maxRetries: 1 })];
  const first = c.endpoints[0].value;
  c.endpoints.push(
    doc({
      ...first,
      id: "catalog.next",
      name: "nextCatalog",
      execution: { ...first.execution, path: "/api/frontspan/next" },
    }),
  );
  const endpointOverrides = {
    "catalog.list": { policies: { timeoutMs: 20, retries: 0 } },
    "catalog.next": { policies: { timeoutMs: 30 } },
  };
  c.environments = [
    profile("selected", {}),
    profile("other", {
      resources: { catalog: { defaults: { timeoutMs: 20000, retries: 2 } } },
      endpoints: endpointOverrides,
    }),
  ];
  fails(() => evaluatePolicy(c, caps, "selected"));
  endpointOverrides["catalog.next"].policies.retries = 1;
  expect(
    evaluatePolicy(c, caps, "other").endpoints.map((e) => e.policies.timeoutMs),
  ).toEqual([20, 30]);
  endpointOverrides["catalog.next"].policies.retries = 2;
  fails(() => evaluatePolicy(c, caps));
  endpointOverrides["catalog.next"].policies.retries = 0;
  first.policies = { timeoutMs: 20000 };
  fails(() => evaluatePolicy(c, caps, "other"));
});

test("direct public env refs are opt-in, intersect across presets and never resolve", () => {
  const c = fixture();
  c.resources[0].value.direct = {
    allowed: true,
    publicBaseUrl: env("PUBLIC_CATALOG"),
  };
  c.endpoints[0].value.execution = { mode: "direct" };
  const allow = preset({ allowedPublicEnvNames: ["PUBLIC_CATALOG"] });
  fails(() => evaluatePolicy(c, []));
  fails(() =>
    evaluatePolicy(c, [allow, preset({ allowedPublicEnvNames: ["OTHER"] })]),
  );
  c.environments = [
    profile("dev", {
      resources: { catalog: { upstream: { baseUrl: env("DEV_CATALOG") } } },
    }),
  ];
  vi.stubEnv("PUBLIC_CATALOG", "synthetic-value-not-for-output");
  vi.stubEnv("DEV_CATALOG", "synthetic-value-not-for-output");
  try {
    const base = evaluatePolicy(c, [allow]);
    expect(base.resources[0]).toEqual({
      id: "catalog",
      upstreamBaseUrl: env("PRIVATE_CATALOG"),
      publicBaseUrl: env("PUBLIC_CATALOG"),
      provenance: { upstreamBaseUrl: "resource", publicBaseUrl: "resource" },
    });
    const result = evaluatePolicy(c, [allow], "dev");
    expect(result.resources[0]).toMatchObject({
      upstreamBaseUrl: env("DEV_CATALOG"),
      provenance: { upstreamBaseUrl: "profile.resource" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic-value-not-for-output|not-a-provenance-source/u,
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

test("profile lookup and override maps never select inherited entries", () => {
  const c = fixture();
  c.environments = [
    profile("dev", {
      resources: Object.create({
        catalog: {
          defaults: { retries: 5 },
          upstream: { baseUrl: env("NOT_OWN") },
        },
      }),
      endpoints: Object.create({
        "catalog.list": { policies: { retries: 9 } },
      }),
    }),
  ];
  const result = evaluatePolicy(c, [preset({ maxRetries: 0 })], "dev");
  expect(result.endpoints[0].policies.retries).toBe(0);
  expect(result.resources[0].upstreamBaseUrl).toEqual(env("PRIVATE_CATALOG"));
  for (const name of ["constructor", "not-a-provenance-source.json", ""])
    fails(() => evaluatePolicy(c, [], name), "CFG_PROFILE_INVALID");
});

test("the result is deeply immutable and does not freeze or alias caller-owned refs or policy lists", () => {
  const c = fixture();
  const p = preset({ allowedExecutionModes: ["proxy"] });
  const result = evaluatePolicy(c, [p]);
  function assertFrozen(value) {
    if (!value || typeof value !== "object") return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const nested of Object.values(value)) assertFrozen(nested);
  }
  assertFrozen(result);
  c.resources[0].value.upstream.baseUrl.name = "CHANGED";
  p.policy.allowedExecutionModes.length = 0;
  expect(result.resources[0].upstreamBaseUrl.name).toBe("PRIVATE_CATALOG");
  expect(result.policy.allowedExecutionModes).toEqual(["proxy"]);
  expect(result.policyProvenance.deniedMethods).toEqual(["builtin"]);
});
