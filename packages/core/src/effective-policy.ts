import type {
  EnvironmentConfig,
  ExecutionMode,
  HttpMethod,
  LoadedConfig,
  OperationalPolicies,
  ValueRef,
} from "./config-types.js";

export type PresetDocument = {
  readonly schemaVersion: 1;
  readonly defaults: OperationalPolicies;
  readonly policy: Readonly<{
    maxTimeoutMs?: number;
    maxRetries?: number;
    allowedExecutionModes?: readonly ExecutionMode[];
    deniedMethods?: readonly HttpMethod[];
    requireStrictValidation?: boolean;
    allowedPublicEnvNames?: readonly string[];
  }>;
};

export class PolicyError extends Error {
  constructor(readonly code: "CFG_POLICY_VIOLATION" | "CFG_PROFILE_INVALID") {
    super(
      code === "CFG_PROFILE_INVALID"
        ? "Invalid profile."
        : "Effective policy violation.",
    );
    this.name = "PolicyError";
  }
}

function violation(): never {
  throw new PolicyError("CFG_POLICY_VIOLATION");
}

type Source =
  | "builtin"
  | `preset:${number}`
  | "root"
  | "resource"
  | "endpoint"
  | "profile.resource"
  | "profile.endpoint";
const fields = ["timeoutMs", "retries", "validation"] as const;
type Field = (typeof fields)[number];
type State = {
  policies: Required<OperationalPolicies>;
  provenance: Readonly<Record<Field, Source>>;
};
const builtin: State = {
  policies: { timeoutMs: 15_000, retries: 0, validation: "strict" },
  provenance: {
    timeoutMs: "builtin",
    retries: "builtin",
    validation: "builtin",
  },
};

function overlay(
  base: State,
  values: OperationalPolicies | undefined,
  source: Source,
): State {
  if (!values) return base;
  // Select only operational fields (root defaults.execution is an editor hint).
  const fieldSource = (key: Field) =>
    values[key] === undefined ? base.provenance[key] : source;
  return {
    policies: {
      timeoutMs: values.timeoutMs ?? base.policies.timeoutMs,
      retries: values.retries ?? base.policies.retries,
      validation: values.validation ?? base.policies.validation,
    },
    provenance: {
      timeoutMs: fieldSource("timeoutMs"),
      retries: fieldSource("retries"),
      validation: fieldSource("validation"),
    },
  };
}

type Constraints = PresetDocument["policy"];
function intersection<T>(
  previous: Set<T> | undefined,
  next: readonly T[],
): Set<T> {
  return new Set(previous ? next.filter((item) => previous.has(item)) : next);
}
function mergePresets(presets: readonly PresetDocument[]) {
  let defaults = builtin;
  let maxTimeoutMs: number | undefined;
  let maxRetries: number | undefined;
  let modes: Set<ExecutionMode> | undefined;
  let publicNames: Set<string> | undefined;
  let strict = false;
  const denied = new Set<HttpMethod>();
  // Each list records every declaring preset, including a looser or tied constraint.
  const policyProvenance: Record<keyof Constraints, Source[]> = {
    maxTimeoutMs: [],
    maxRetries: [],
    allowedExecutionModes: [],
    deniedMethods: [],
    requireStrictValidation: [],
    allowedPublicEnvNames: [],
  };
  for (const [i, preset] of presets.entries()) {
    const source = `preset:${i}` as const;
    const p = preset.policy;
    defaults = overlay(defaults, preset.defaults, source);
    for (const key of Object.keys(policyProvenance) as (keyof Constraints)[]) {
      if (p[key] !== undefined) policyProvenance[key].push(source);
    }
    if (p.maxTimeoutMs !== undefined)
      maxTimeoutMs = Math.min(maxTimeoutMs ?? Infinity, p.maxTimeoutMs);
    if (p.maxRetries !== undefined)
      maxRetries = Math.min(maxRetries ?? Infinity, p.maxRetries);
    if (p.allowedExecutionModes)
      modes = intersection(modes, p.allowedExecutionModes);
    if (p.allowedPublicEnvNames)
      publicNames = intersection(publicNames, p.allowedPublicEnvNames);
    for (const method of p.deniedMethods ?? []) denied.add(method);
    strict ||= p.requireStrictValidation === true;
  }
  if (modes?.size === 0) violation();
  for (const sources of Object.values(policyProvenance)) {
    if (!sources.length) sources.push("builtin");
  }
  const policy = {
    ...(maxTimeoutMs === undefined ? {} : { maxTimeoutMs }),
    ...(maxRetries === undefined ? {} : { maxRetries }),
    allowedExecutionModes: [
      ...(modes ?? (["direct", "proxy"] as const)),
    ].sort(),
    deniedMethods: [...denied].sort(),
    requireStrictValidation: strict,
    allowedPublicEnvNames: [...(publicNames ?? [])].sort(),
  };
  return { defaults, policy, policyProvenance };
}

function valid(key: Field, values: OperationalPolicies, p: Constraints) {
  switch (key) {
    case "timeoutMs":
      return (
        values.timeoutMs === undefined ||
        p.maxTimeoutMs === undefined ||
        values.timeoutMs <= p.maxTimeoutMs
      );
    case "retries":
      return (
        values.retries === undefined ||
        p.maxRetries === undefined ||
        values.retries <= p.maxRetries
      );
    case "validation":
      return (
        values.validation === undefined ||
        !p.requireStrictValidation ||
        values.validation === "strict"
      );
  }
}

// The base is already valid. A bad profile resource field is effective unless
// *every* endpoint on that resource explicitly replaces that same field.
// Counting valid replacements avoids a profiles × endpoints expansion, even
// when a popular resource has defaults in many unselected profiles.
function validateProfile(
  env: EnvironmentConfig,
  policy: Constraints,
  resourceOf: Map<string, string>,
  endpointCounts: Map<string, number>,
) {
  const replacements = new Map<string, Record<Field, number>>();
  for (const [id, entry] of Object.entries(env.endpoints ?? {})) {
    const values = entry?.policies;
    if (!values) continue;
    const resource = resourceOf.get(id)!; // Cross-references validated by the authored loader.
    const counts = replacements.get(resource) ?? {
      timeoutMs: 0,
      retries: 0,
      validation: 0,
    };
    for (const key of fields) {
      if (!valid(key, values, policy)) violation();
      if (values[key] !== undefined) counts[key]++;
    }
    replacements.set(resource, counts);
  }
  for (const [id, entry] of Object.entries(env.resources ?? {})) {
    const values = entry?.defaults;
    if (!values) continue;
    for (const key of fields) {
      if (
        !valid(key, values, policy) &&
        (replacements.get(id)?.[key] ?? 0) < (endpointCounts.get(id) ?? 0)
      )
        violation();
    }
  }
}

function own<T>(map: Readonly<Record<string, T>> | undefined, id: string) {
  return map && Object.hasOwn(map, id) ? map[id] : undefined;
}

function effective<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) effective(child);
    Object.freeze(value);
  }
  return value;
}

type EffectivePolicy = Readonly<{
  profile: string | null;
  policy: Constraints &
    Required<Omit<Constraints, "maxTimeoutMs" | "maxRetries">>;
  policyProvenance: Readonly<Record<keyof Constraints, readonly Source[]>>;
  resources: readonly Readonly<{
    id: string;
    upstreamBaseUrl: ValueRef;
    publicBaseUrl?: ValueRef;
    provenance: Readonly<{ upstreamBaseUrl: Source; publicBaseUrl?: Source }>;
  }>[];
  endpoints: readonly Readonly<{
    id: string;
    resourceId: string;
    executionMode: ExecutionMode;
    policies: Required<OperationalPolicies>;
    provenance: Readonly<Record<Field | "executionMode", Source>>;
  }>[];
}>;

/** Evaluates validated authored documents and validated presets in pin order; performs no IO. */
export function evaluatePolicy(
  config: LoadedConfig,
  presets: readonly PresetDocument[],
  profile?: string,
): EffectivePolicy {
  const selected =
    profile === undefined
      ? undefined
      : config.environments.find(({ value }) => value.name === profile)?.value;
  if (profile !== undefined && !selected)
    throw new PolicyError("CFG_PROFILE_INVALID");
  const { defaults, policy, policyProvenance } = mergePresets(presets);
  if (policy.requireStrictValidation && !config.root.value.modules?.validation)
    violation();
  const root = overlay(defaults, config.root.value.defaults, "root");
  const resourceDefaults = new Map<string, State>();
  const publicNames = new Set(policy.allowedPublicEnvNames);
  const resources = config.resources.map(({ value }) => {
    resourceDefaults.set(value.id, overlay(root, value.defaults, "resource"));
    const override = own(selected?.resources, value.id)?.upstream?.baseUrl;
    const publicRef = value.direct?.publicBaseUrl;
    if (publicRef?.kind === "env" && !publicNames.has(publicRef.name))
      violation();
    return {
      id: value.id,
      upstreamBaseUrl: { ...(override ?? value.upstream.baseUrl) },
      ...(publicRef && { publicBaseUrl: { ...publicRef } }),
      provenance: {
        upstreamBaseUrl: override
          ? ("profile.resource" as const)
          : ("resource" as const),
        ...(publicRef && { publicBaseUrl: "resource" as const }),
      },
    };
  });
  const resourceOf = new Map<string, string>();
  const endpointCounts = new Map<string, number>();
  const endpoints = config.endpoints.map(({ value }) => {
    const { id, resourceId } = value;
    resourceOf.set(id, resourceId);
    endpointCounts.set(resourceId, (endpointCounts.get(resourceId) ?? 0) + 1);
    const mode = value.execution?.mode;
    if (
      !policy.allowedExecutionModes.includes(mode) ||
      policy.deniedMethods.includes(value.source.method)
    )
      violation();
    const base = overlay(
      resourceDefaults.get(resourceId)!,
      value.policies,
      "endpoint",
    );
    for (const key of fields)
      if (!valid(key, base.policies, policy)) violation();
    const resourceOverride = own(selected?.resources, resourceId)?.defaults;
    const endpointOverride = own(selected?.endpoints, id)?.policies;
    const state = overlay(
      overlay(base, resourceOverride, "profile.resource"),
      endpointOverride,
      "profile.endpoint",
    );
    return {
      id,
      resourceId,
      executionMode: mode,
      policies: state.policies,
      provenance: { ...state.provenance, executionMode: "endpoint" as const },
    };
  });
  for (const { value } of config.environments)
    validateProfile(value, policy, resourceOf, endpointCounts);
  return effective({
    profile: profile ?? null,
    policy,
    policyProvenance,
    resources,
    endpoints,
  });
}
