# Configuration contract v1 — proposed

Status: proposed for S0-04 (#4). ADR-003/008/016 apply. Examples are synthetic. This is a specification, not a running schema or implementation.

## Ownership and layout

The project root contains frontspan.config.json. Under frontspan/ keep resources/<id>.json, endpoints/<domain>/<name>.json, environments/<profile>.json, optional approved contracts/ snapshots and frontspan.lock.json (S0-05 owns exact format). Generated source defaults to src/generated; handwritten code stays outside. Future modules/ directory is reserved, not accepted by MVP loader. All paths are project-relative, canonicalized and confined to approved roots; no traversal, absolute paths, symlink escapes or overlapping input/output directories. File names do not define identity; IDs do. A duplicate ID, unknown config file kind, or malformed file fails loading. Reject duplicate JSON object keys and dangerous prototype keys. CLI and Studio call the same loader, validator and writer.

Each authored document has schemaVersion: 1. Publish Draft 2020-12 JSON Schemas locally with the package; optional $schema is an IDE hint only, never a URL fetched during validation. Strict objects reject unknown keys, except explicitly defined extension namespaces (none executable in MVP). Schema validation is followed by semantic cross-file checks. Defaults are computed once by the configuration engine, never by UI or codegen independently.

## Root file

```json
{
  "schemaVersion": 1,
  "project": { "name": "insurance-portal" },
  "presets": [{ "package": "@example/frontend-preset", "version": "1.0.0" }],
  "modules": { "codegen": true, "query": true, "bff": true, "validation": true },
  "paths": {
    "resources": "frontspan/resources",
    "endpoints": "frontspan/endpoints",
    "environments": "frontspan/environments",
    "generated": "src/generated"
  },
  "defaults": { "execution": "proxy", "timeoutMs": 15000, "validation": "strict" }
}
```

project.name is a human-readable slug; a project does not use it as a security identity. modules are booleans for known installed capabilities; query and validation generation require codegen; proxy requires bff (runtime adapter). Disabled required security validation is an error, not a module shortcut. paths optional with documented defaults above. Root defaults optional; built-in execution defaults to proxy when available; otherwise explicit direct selection required. Built-in timeout 15000 ms, validation strict, retries 0, cache off. No auto-generated public endpoint on import.

## Resource file: upstream contract and destination

```json
{
  "schemaVersion": 1,
  "id": "policies",
  "kind": "http",
  "contract": {
    "kind": "file",
    "path": "frontspan/contracts/policies.openapi.json"
  },
  "upstream": {
    "baseUrl": { "kind": "env", "name": "POLICY_API_URL" },
    "auth": { "kind": "forward", "adapterId": "existing-session" }
  },
  "direct": { "allowed": false },
  "defaults": { "timeoutMs": 10000, "validation": "strict" }
}
```

resource.id is immutable slug [a-z][a-z0-9-]{0,62}; renaming is explicit migration, not guessed. kind=http in MVP. contract source is file or url, independent from runtime baseUrl. URL source is an explicitly configured value reference, with optional server-only secret ref for import auth (header name validated; credential may not cross origins). Snapshot content is not automatically committed. JSON/YAML supported for source contracts only. Local file refs disabled by default; opt-in list of project-relative permitted roots for referenced files. Remote refs rejected per ADR-016. Never trust spec servers or vendor extensions as executable destinations or credentials.

ValueRef for upstream baseUrl and configured import URL is either {kind:"literal",value:string} or {kind:"env",name:string}; names match [A-Z_][A-Z0-9_]*. Literal URLs may not contain credentials or sensitive values. Server-only credentials are SecretRef {kind:"env",name:string} in MVP; later existing manager adapters may extend discriminant. No string interpolation, raw token fields, arbitrary executable functions or automatic env export. Secret resolver invoked only in server-side context when needed; missing value fails closed. Never serialize resolved values into IR, lock, codegen or browser. Runtime URL overrides are still policy checked. Direct browser URL is a separate explicit public literal or approved public env reference; never reuse private upstream URL or secret. Auth kind none or forward adapter ID (adapter behavior S0-06); direct browser authentication is existing application behavior, not a server forwarding configuration. direct.allowed default false; true authorizes only eligibility, not backend authorization.

## Endpoint file: proxy example

```json
{
  "schemaVersion": 1,
  "id": "policies.list",
  "resourceId": "policies",
  "source": { "method": "GET", "path": "/policies" },
  "domain": "policies",
  "name": "listPolicies",
  "execution": { "mode": "proxy", "method": "GET", "path": "/api/frontspan/policies" },
  "response": {
    "kind": "paginated",
    "mapping": { "items": "/result/items", "page": "/result/page", "pageSize": "/result/pageSize", "totalCount": "/result/total" }
  },
  "query": { "kind": "query" },
  "policies": { "timeoutMs": 8000, "validation": "strict" }
}
```

## Endpoint file: direct example

```json
{
  "schemaVersion": 1,
  "id": "catalog.detail",
  "resourceId": "catalog",
  "source": { "method": "GET", "path": "/products/{id}" },
  "domain": "catalog",
  "name": "getProduct",
  "execution": { "mode": "direct" },
  "response": { "kind": "data", "mapping": { "data": "/payload" } },
  "query": { "kind": "query" }
}
```

The direct example requires catalog resource with direct.allowed:true and explicit publicBaseUrl. No server-side privacy guarantees can be enforced by a browser mapper. Direct mode fails if the endpoint requires field filtering, secret injection, server mapping of sensitive data or other mandatory server controls. Direct configuration is explicit; there is no silent proxy-to-direct fallback. Root defaults.execution may preselect a Studio form but persisted execution.mode is required.

Endpoint IDs are domain-qualified immutable slugs, unique project-wide; domain slug and generated name are explicit, collision checks mandatory, JS reserved names rejected. source identifies an operation by exact HTTP method and path template within the resource, independent of operationId. An imported operation may be exposed under different explicit endpoint IDs, each with unique route/name. A configured endpoint is selected; service/tag selection in Studio/CLI previews and materializes concrete endpoint files, not a wildcard that silently exposes newly imported operations. Importing is not publishing. Endpoint removal is reviewed by sync. Proxy route method must equal source method in MVP; explicit route and path parameter bindings must match upstream template (identity by name in MVP). Duplicate and structurally ambiguous route patterns are errors; reserve a dedicated Next route prefix. Proxy is a registry of configured operations, never arbitrary URL input. No arbitrary custom TS, composite step or workflow config in v1.

response.kind: data, paginated, empty, binary (raw response, not JSON wrapper). JSON mapping uses RFC 6901 JSON pointers to source fields, not executable expressions. Missing mapping source or incompatible type produces diagnostic. For data, absent mapping means full JSON body; pagination requires items, page, pageSize, totalCount. Derived page counts/flags, index base, cursor extensions, error normalization and raw handling are S0-06 contracts. MVP request mapping can be identity or explicit parameter/body field pointer projection (detailed typed rules required in S0-06; no arbitrary expressions or weakening required fields); until specified reject nonidentity. JSON response field filtering for security must happen server-side with reviewed policy, not merely projection. Query kind query/mutation/none explicit (GET/HEAD default query when module enabled, other methods default mutation; explicit override requires reviewed semantics). Declarative mutation invalidation names endpoint IDs, exact or prefix scope; S0-06 specifies keys and safety. Validation strict/warn/off only for optional response validation; mandatory config, route, required input/security checks never disabled.

## Environment file

```json
{
  "schemaVersion": 1,
  "name": "development",
  "resources": {
    "policies": { "upstream": { "baseUrl": { "kind": "env", "name": "DEV_POLICY_API_URL" } } }
  },
  "endpoints": {
    "policies.list": { "policies": { "timeoutMs": 6000 } }
  }
}
```

Select environment explicitly by CLI flag or FRONTSPAN_ENV; reject disagreement when both supplied, no inferred production from NODE_ENV. Require environment name declared by existing file; no profile means base config for offline inspection/generation, runtime startup requires explicit profile. Profile cannot change source, endpoint IDs, route, selection, mappings, generated contract, module set, direct eligibility, auth scheme or secret visibility. Permitted overrides limited to runtime base URL/secret reference (same configured auth kind and approved destination), operational timeout/cache/retry and optional response validation within hard policy. Production cannot weaken mandatory policy; no environment-dependent generated types. CLI/Studio show selected profile and provenance, never secret values.

## Precedence and hard policy

For ordinary operation defaults: built-ins -> presets in listed order (later wins for ordinary defaults) -> root defaults -> resource defaults -> endpoint policies -> selected environment resource overrides -> selected environment endpoint overrides. Environment overrides are restricted to the explicit allowlist. Resource and endpoint identity/shape are authored, not merged from presets; presets can supply default behavior and constraints, not silently create routes. Resolve each field with documented semantics; object keys merge recursively only for declared mergeable objects; arrays replace entirely; discriminated unions replace as a whole; scalar replaces; absent inherits; null only for fields explicitly nullable, never an implicit delete. Unknown override keys fail; no JS prototype operations.

Preset package/version must be exact and resolved from installed lockfile, no network installation during load and no executable preset JS. Each preset exports declarative defaults and policy JSON; schema validates both. Mandatory constraints accumulate restrictively: allowed sets intersect, maximums take minimum, required checks combine by logical OR, denials combine by union. Conflicting/empty required capabilities fail; do not silently relax or clamp invalid effective config. Project-authored overrides cannot replace hard policies. Example: preset cap 10000 ms; endpoint 8000, dev profile 6000 => 6000; profile 12000 => error. Mandatory direct=false cannot be overridden by endpoint or environment.

Security enforcement is limited by project owner's ability to modify code/config. Trust roots (approved preset pin/policy digest, CI rules and runtime enforcement) require S0-06 design; local JSON alone is not enterprise enforcement. Effective policy must be verified at build and server startup; runtime cannot accept client-provided override. Do not store real private config in public repository.

## Loading, diagnostics and migrations

1. Find explicit project root (CLI/Studio same root); read bounded bytes, parse strict JSON and reject unknown versions.
2. Validate document shapes; resolve exact installed preset JSON; validate all IDs and path containment.
3. Resolve cross-file refs, operation bindings, capability dependencies and route collisions.
4. Apply allowed defaults/profile and hard policy; produce immutable effective config plus provenance for each overridden value; do not resolve secret values.
5. Pass effective config and approved source snapshots to IR builder. Validate selected closure before planning any writes.
6. On failure no output changes. Unknown major schema version fails with upgrade instructions. Migration is explicit preview/apply via CLI or Studio, deterministic sequential vN->vN+1 functions; show diff and use revision checks; never silently rewrite, downgrade or overwrite dirty files. No v0 migration currently.
7. Studio edits use expected document digest; reject stale writes; stage multi-file changes with recovery journal (S0-05/07 specifies protocol). Watch events trigger re-read/validate, not unapproved writes. Commit snapshots only when sanitized and authorized.

Acceptance: two synthetic endpoints resolve with stable IDs and profile-independent contracts; precedence and hard-policy examples pass; invalid refs/paths, duplicates, unknown fields/versions, secret literals, disabled required modules and stale edits are rejected. Exact JSON Schema files, defaults, policy implementation, bounds and migration tests are Sprint 1 work.