# Core configuration foundation

`@frontspan/core` is private and unpublished. The root entry point contains only TypeScript contracts. Use the Node-only `@frontspan/core/config` entry point to load authored configuration from an explicit project root:

```ts
import { loadConfig } from "@frontspan/core/config";

const result = await loadConfig("/path/to/project");
if (result.ok) {
  // Authored, immutable documents with project-relative paths; not runtime policy.
  const { root, resources, endpoints, environments } = result.config;
} else {
  const [diagnostic] = result.diagnostics;
}
```

Draft 2020-12 schemas ship as `@frontspan/core/schemas/{root,resource,endpoint,environment}.schema.json`. The loader checks only its bundled schema vocabulary, not arbitrary JSON Schemas. `$schema` in authored JSON is an IDE hint; the loader never follows it. Schema validation is followed by layout, module, reference, and route checks. IDs come from document content, not filenames. Documents are returned in locale-independent path order. On failure, the loader returns a single deterministic error with a stable code, document kind, an optional zero-based index in that kind's sorted file list, and a safe JSON pointer. Diagnostics do not quote authored values or machine paths.

The authored loader never resolves or reads environment values, imports contracts, evaluates policy, creates routes, or changes files. A missing source contract can still have a valid configured path; existence and content belong to the import step. The loader validates URL syntax and rejects credential-bearing literals; it does not verify public environment reference approval, destination authorization, or other effective policy. Configuration may itself contain private destination references and is not safe to expose to browsers. Use the effective loader below for preset resolution, profile selection and policy merge. Editing and revision coordination belong to #24. Fields without a concrete approved authored shape (such as import credential headers, contract-ref roots, cache, request projection and invalidation) are rejected until specified. They are not silently ignored.

The read limits are 256 KiB per JSON document, 8 MiB total, 64 nested JSON containers, and 1,024 enumerated directory entries. The loader confines canonical project-relative inputs to the supplied root, rejects symbolic links beneath it, and checks regular file identity and metadata around reads. It is not a filesystem sandbox or a coherent multi-file snapshot against concurrent hostile local writers. Treat the explicit project root and its filesystem as local trust boundaries.

## Offline effective configuration (CFG-02)

`loadEffectiveConfig(projectRoot, { evidence, profile?, environmentProfile? })` is available from the same Node-only config entry point. Supply `FrozenPresetEvidence[]` from a trusted caller, or `[]` when there are no required presets. Each record contains `package`, exact `version`, `packageDirectory` (canonical, project-relative, with no symlinks) and `expectedDigest` (`sha256:` plus 64 lowercase hex digits). Supply the **separately approved digest of the file bytes**, not a digest computed from the installation under examination. Core does not invoke a package manager, read a lockfile, or accept evidence from authored JSON. Up to 512 presets are supported; the preset read phase has its own 8 MiB total budget. CLI/package-manager adapters must establish frozen-install identity and provide canonical install directories in a supported layout.

The authored and required pin sets must match exactly. Core checks each installed manifest's name, version and literal `./frontspan-preset.json` export to the same filename, hashes the raw bytes, and validates the same bytes against the bundled `preset.schema.json`. No executable entry points, fetches, or fallback. The result is a deeply frozen config with effective settings, reference-only destinations, and per-field source layers (`preset:0` is the first authored pin). It does not serialize resolved secrets or install paths. Treat even unresolved config as server-side information.

Precedence: built-ins → presets in authored order → root → resource → endpoint → profile resource → profile endpoint. The supported operational fields are `timeoutMs`, `retries`, and optional-response `validation`; persisted execution modes are not defaults. Hard `maxTimeoutMs`/`maxRetries` take the minimum; `allowedExecutionModes` and `allowedPublicEnvNames` intersect; `deniedMethods` accumulate; `requireStrictValidation` is a logical OR and requires the validation module. Public env references are denied unless expressly allowed. Profile URL overrides replace entire references. Only the authored environment schema's allowlist is supported. Core validates the base and all profiles, reports violations instead of clamping, and never reads process environment values. Supply the CLI profile and/or the separately obtained `FRONTSPAN_ENV` name; disagreement or an unknown profile fails. No profile means offline base inspection.

Verification establishes **local integrity**, not organization approval or permission to connect to any destination. An independent protected build/deployment trust root must supply required pins and expected digests, and server startup/execution must enforce actual destinations and runtime policy. See the [ADR-017 addendum](../../docs/decisions/ADR-017-config-ir-v1.md) and [governance specification](../../docs/specifications/PROXY-GOVERNANCE-V1.md).

See [Configuration v1](../../docs/specifications/CONFIGURATION-V1.md) for the accepted design and follow-up contracts.
