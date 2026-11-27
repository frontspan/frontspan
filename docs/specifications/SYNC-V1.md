# Intelligent sync and lockfile v1

Status: proposed; S0-05 (#5), ADR-016/017. This is design, not executable code or proof of compatibility.

## Baseline, candidate and snapshot policy

Distinguish raw source bytes, canonical normalized source contract, selected exposed contract, and generated artifact bytes. Baseline is the last successfully applied and reviewed-as-required local contract set, not the latest fetched Swagger. A candidate is loaded explicitly from configured sources and validated without mutating baseline. Compare both source and exposed contracts: source change can break projection or upstream behavior even when generated type names remain identical. Source metadata-only changes outside selected closure may be recorded without code changes; invalid structural/security inputs always block. New upstream operations remain unselected until explicit endpoint configuration per ADR-017.

Reproducible offline generation requires approved immutable input snapshots. Proposed default frontspan/contracts/.snapshots/<resource-id>/<digest>.json for sanitized canonical IR snapshots (not raw responses, credentials, raw examples or arbitrary vendor extensions). Snapshot includes versioned source graph and exposed graph/selected closure sufficient for deterministic diff and regeneration; exact splitting and schema schemaVersion/irVersion validation during implementation. Raw local authored Swagger may stay separately where authorized. No automatic commit of raw fetched contracts; snapshot export is explicit, reviewable and must be authorized. Strip nonessential examples, descriptions containing secrets, server destinations and credential metadata while preserving relevant schema/contract semantics; cannot guarantee automatic detection, require review. If contract itself confidential, store snapshots in ignored local directory or authorized private artifact store (provider not required by toolkit); committed lock references digest only and CI must be provisioned the approved exact bytes. No public repository may contain proprietary contract/schema even in normalized form. Offline CI fails with SNAPSHOT_MISSING when unavailable; it must not fetch latest as fallback. Never resolve server secret values during codegen. Keep previous snapshot available for Git/review or private retention; garbage collection not MVP.

## Lockfile

Tracked path frontspan/frontspan.lock.json. Strict JSON, versioned, no timestamps, machine paths, credentials or raw payload. Example digests abbreviated for readability only; real values sha256: + 64 lowercase hex.

```json
{
  "lockVersion": 1,
  "irVersion": 1,
  "configSchemaVersion": 1,
  "toolchain": {
    "frontspan": "0.1.0",
    "parser": "<exact installed version>",
    "emitter": "<exact implementation version>",
    "formatter": "<exact installed version>"
  },
  "generationInputDigest": "sha256:...",
  "policyDigest": "sha256:...",
  "resources": {
    "policies": {
      "sourceVersion": "3.1.0",
      "rawDigest": "sha256:...",
      "sourceDigest": "sha256:...",
      "snapshotDigest": "sha256:..."
    }
  },
  "endpoints": {
    "policies.list": {
      "sourceOperationId": "<canonical resource/method/path identity>",
      "exposedDigest": "sha256:..."
    }
  },
  "artifacts": {
    "src/generated/policies/types.ts": {
      "kind": "types",
      "owners": ["policies.list"],
      "digest": "sha256:..."
    }
  }
}
```

Snapshot digest covers canonical snapshot bytes; source digest covers canonical relevant source graph; exposed digest covers endpoint plus reachable schema graph (cycles represented by IDs, canonical sorted nodes, not recursive hash expansion). Raw digest hashes original source bytes, may change without semantic changes. Include exact preset versions and generation-relevant config/policy fingerprint in generation input. Policy digest excludes resolved env/secret values; runtime environment validation independently required. Lock includes baseline pointer and ownership, not authentication or authorization. Unknown lock version fails; explicit migration uses preview and recoverable writer. No implicit lock regeneration when missing. Use canonical serialization/sha256 from generation spec. Lock written last in transaction, baseline changes only after successful apply. Git tracks lock and authorized snapshots and generated source together; do not commit one without applicable counterparts. Private snapshots require accessible pinned bytes.

## Diff and classification

Compare stable IDs, method/path, direction-specific schema constraints, media, serialization, status sets, security metadata, mappings, public export locations/names, policy/execution and generated signatures. Produce stable structured change records (id, kind, old/new semantic summaries or redacted digests, affected IDs, severity, reason). Classifications: metadata-only, compatible, breaking, review-required (unknown/ambiguous), invalid. Aggregate worst classification; invalid blocks without approval, breaking and review-required block automatic apply. Distinguish API compatibility from generated consumer source compatibility. For requests, new accepted input set must be a superset of old; for responses, new possible outputs must fit old consumer expectations and validators. Proof only for supported subset; composition, regex, defaults, behavioral or ambiguous changes often unknown. Check both upstream and exposed boundaries and emitted API surface. No broad claim to solve JSON Schema implication.

| Change | Default classification / reason |
|---|---|
| Description/tag metadata not affecting domain/exports | metadata-only; output comments may change |
| New unselected operation | compatible catalog-only; no route generated |
| Explicit newly selected independent endpoint | compatible if no collision or security/policy change |
| Remove selected operation or endpoint | breaking |
| Change source method/path or proxy route | breaking; no guessed rename |
| Add optional request field accepted by backend | compatible if no new serialization/behavior constraint |
| Add required request field; optional becomes required | breaking |
| Remove request enum value / tighten input constraint | breaking |
| Widen request enum or supported constraint | compatible only when inclusion verified |
| Add response enum value or nullable possibility | breaking; old consumers may reject |
| Remove required response field / make it optional | breaking |
| Add optional response property | compatible only if old schema/validation permits unknown key and public contract/behavior safe; otherwise breaking or review-required |
| Narrow response enum/value set | compatible only when old validation, public API and usage semantics preserved; otherwise review-required |
| Change response media/status/serialization | review-required or breaking when proven |
| Changed mapping pointer, direct/proxy mode, auth/security metadata, cache or mandatory policy | review-required at minimum; invalid if policy violated |
| Public export rename, old module path removed, signature incompatibility | breaking |
| Emitter/toolchain version change | review-required unless equivalence and surface verified; no automatic trust |
| Unsupported selected schema, unresolved ref, invalid mapping or policy | invalid; cannot approve away |

Pure static TypeScript compatibility is not enough. Include request serializer, validators and runtime response behavior. Field additions can be breaking under strict additionalProperties constraints. Defaults that inject values, changes to read/write access, and ambiguous union behavior require review. Runtime profile-only changes need policy verification; no generation change expected under ADR-017.

## Impact analysis

Build reverse graph from source operation and schema IDs to exposed endpoints and reachable derived schemas, then to generated artifacts and export symbols. Traverse with visited IDs/SCCs to handle recursive dependencies. Include mapping path and security scheme dependencies, shared schema users, query invalidation targets and public barrels. Recompute full deterministic generation plan in MVP (no partial-write optimization); report affected endpoints/files and why, distinguish unaffected byte-identical artifacts. Unselected schema changes need not regenerate unrelated artifacts; unknown dependency conservatively require review. No claims to detect all handwritten call sites; CI consumer typecheck and review required. Future optional TS AST usage analysis may supplement, not gate completeness. Report summaries redact sensitive raw values.

## Approval and execution

Shared service workflow: load baseline -> fetch/load candidate explicitly -> validate -> compare -> impact -> generation plan -> ownership preflight -> classify -> preview -> verify exact inputs -> apply -> new baseline. No automatic writes on watch/import or CI. Interactive CLI/Studio can auto-apply only compatible or metadata-only plans when explicitly enabled in project sync policy and user initiated sync (default preview). Breaking and review-required require explicit exact-plan approval by developer with project authority and Git review under organization governance. Invalid and ownership conflicts never overridden by approval. Approving a breaking contract does not grant backend privileges or bypass mandatory policy. No blanket --force/--yes bypass; compatible noninteractive apply may use explicit opt-in mode. Approval grants only one candidate plan: digest includes baseline lock digest, candidate snapshot digest(s), generation inputs, classification, ordered change records, artifact operations and expected current path states, preset/policy fingerprint, and toolchain versions. Recompute and compare immediately before mutation under writer lock; stale plan requires fresh review. Approval is a project-local intent, not cryptographic proof of maintainer identity; CI protections and Git PR review supply authorization. Plan/approval local ephemeral by default; record reviewed plan digest and summary in PR or optional sanitized approval record alongside commit; never commit secrets. S0-06 owns centrally enforced approval/trust policy. No autonomous PR creation in runtime; CLI may produce a summary for existing workflow.

Proposed CLI surface (S0-07 owns final UX):
- frontspan generate --preview: offline artifact plan from pinned baseline, read-only.
- frontspan generate: regenerate same accepted baseline with ownership checks and exact review when public surface or generator version changes; initial generation explicit baseline creation after preview.
- frontspan sync --preview: explicit candidate load, read-only plan.
- frontspan sync --apply-compatible: only valid compatible/metadata plans and enabled policy; no breaking approval.
- frontspan sync --apply --approve <planDigest>: exact previously reviewed breaking/review-required plan; revalidate candidate and paths; require authorized interactive/CI workflow according to policy, do not approve newly fetched different candidate.
- frontspan check: offline pinned snapshot and expected generated output, no writes or remote IO.
- frontspan sync --check-remote: optional separately authorized network drift detection, report only; never update baseline.
Command spelling/flags are proposals. Check mode deterministic output and machine-readable JSON; proposed exits 0 clean/success, 1 drift/review required, 2 invalid/config/IO/conflict. Missing baseline/snapshot is error not silent pass.

## CI and rollback

PR CI installs frozen dependencies, validates config and approved preset, resolves pinned snapshots, renders in memory, checks lock/manifest/artifact digests and stale owned paths, typechecks consuming fixture/project, and fails on missing/modified/untracked conflicting artifacts. No network or credential resolution in default codegen check. To enforce breaking review in CI, compare proposed lock/snapshots with protected base revision (not only proposed lock); report classification and require approved review for breaking/unknown, never trust editable approval JSON alone. First baseline distinct explicit initialization review. CI does not silently regenerate/commit, nor assert all deployed upstreams match snapshot; optional network drift check runs in approved network and fails independently. Runtime URL/profile/policy checks separate. Exact GitHub workflow and branch rules in S0-06/Sprint 1. Git revert restores consistent config/snapshots/generated/lock; private snapshots must remain retrievable; never roll back backend service by local client revert. Partial local transactions recovered per generation spec. 
   
## Verification matrix (planned)

- Request widening/narrowing, response widening/narrowing, optional vs required, strict additionalProperties, unsupported schema and changes in media/status/security/policy classify conservatively.
- Unselected additions remain catalog-only; shared recursive graph changes affect all dependent endpoints; removed export flags breaking.
- Mapping invalid after upstream field rename blocks even if exposed types unchanged.
- Compatible opted-in apply succeeds; default sync preview is read-only; breaking/unknown requires exact approval; stale approval rejected on any changed input, policy, artifact or baseline.
- Lock byte/hash deterministic; unknown version/missing snapshot/modified manifest fail; initial generation cannot adopt unrelated existing files.
- CI detects stale/modified artifacts and compares protected base classification; offline check never fetches latest.
- No secret-bearing artifacts, snapshots or diagnostics; approved private snapshot provisioning can reproduce exactly; invalid/conflict cannot be bypassed.
- Crash/recovery and concurrent edits per generation spec; Git revert coherent baseline and output.

No tests executed. Numeric resource limits, exact canonicalizer/formatter/emitter dependency, snapshot redaction procedure and schema, transport/cache and governance contracts, CLI UX and private snapshot provisioning must be verified in their respective issues.