# Code generation and file ownership v1

Status: proposed; S0-05 (#5). Depends on ADR-016/017 and IR-V1. No executable implementation or tested compatibility is implied.

## Boundaries

Codegen consumes the validated selected exposed IR and generation-relevant effective configuration, never raw OpenAPI or secret values. The source graph remains available for upstream impact analysis. CLI and Studio use the same plan/check/apply services. Runtime packages must not import codegen, parser, writer or compiler. Initially keep planner, emitters, generators, naming, ownership, writer, diff, impact, sync and lockfile as internal modules of codegen; core owns neutral contracts and diagnostics. Exact public exports subject to implementation review. No arbitrary third-party plugins, user templates or source execution in MVP.

## Proposed contracts

```ts
type ArtifactKind = "types" | "service" | "queries" | "mutations" | "schemas" | "barrel";
interface Artifact {
  path: string; // project-relative POSIX path
  kind: ArtifactKind;
  owners: string[]; // stable endpoint/schema/domain IDs
  dependencies: string[]; // artifact paths
  content: string; // final UTF-8 text
  digest: string; // sha256 of final bytes
}
interface GenerationPlan {
  planVersion: 1;
  inputDigest: string;
  artifacts: Artifact[];
  diagnostics: Diagnostic[];
}
interface Generator {
  id: string;
  requires: string[];
  plan(context: Readonly<GeneratorContext>): PlannedSymbol[];
  render(context: Readonly<ResolvedGeneratorContext>): Artifact[];
}
```

GeneratorContext contains selected exposed contracts, reachable schemas, generation settings and immutable symbol table inputs; ResolvedGeneratorContext adds allocated file paths, symbols/imports and dependency graph. PlannedSymbol identifies stable owner ID, export name, file kind and dependencies. Generator implementations return data only; orchestrator validates the DAG, rejects cycles in generator dependencies and duplicate artifact producers, allocates symbols globally before render, then invokes generators in stable topological order. Recursive schema references may form schema SCCs; this is distinct from generator task cycles. No I/O or arbitrary hooks in generators. Formatter is deterministic, pinned and applied in memory before digest. Emitter interface isolates structured TS declarations/expressions from controlled boilerplate templates; compiler API stays behind adapter, with exact implementation selected via spike. Never interpolate raw specification strings as source syntax; use escaped literal/comment/identifier helpers and property access appropriate to arbitrary keys. No eval or shell execution of source descriptions.

## Layout and symbol ownership

Fixed default root src/generated as specified in Configuration v1; only root path configurable within validated boundaries. Domain folders are explicit domain slugs; reserve shared and root barrel namespace. Example:

```text
src/generated/
  policies/
    types.ts
    service.ts
    queries.ts
    mutations.ts
    schemas.ts
    index.ts
  catalog/
    types.ts
    service.ts
    queries.ts
    schemas.ts
    index.ts
  shared/
    types.ts
    schemas.ts
    index.ts
  index.ts
```

Emit only needed files and barrels; missing query/validation module or zero mutation means omit corresponding artifacts, with dependency checks. Shared schema nodes used by multiple domains reside in shared; ownership of a recursive component (SCC) is unified to prevent cyclic initialization between files. Avoid cross-domain imports through barrels; direct typed imports with explicit ESM-compatible specifiers as applicable; lazy validators for supported recursion. Shared placement can change when selection changes: treat removed old public import/export path as potentially breaking and require approval; preserve public re-export only when explicitly planned and tested. Namespaced root exports (e.g. export * as policies) avoid accidental cross-domain name collisions; domain barrels explicit exports. No generated file depends on app feature code except explicit documented runtime adapter contracts. Handwritten wrappers and UI outside root.

Explicit endpoint name is lowerCamelCase, valid TypeScript identifier; type name derived PascalCase plus Input/Result, query key/options/hook, mutation and Zod suffixes from versioned naming conventions. Example listPolicies -> ListPoliciesInput, ListPoliciesResult, listPolicies, listPoliciesQueryKey, listPoliciesQueryOptions, useListPoliciesQuery, listPoliciesResultSchema. Exact argument shape, query key and error contract follow S0-06, not guessed here. Named schemas derive stable names from qualified identity and configured explicit overrides (override schema syntax to be specified with config implementation). Inline names derive from stable operation/field context, not traversal index. A missing operationId does not prevent generation. Reserve all symbols including generated helper names and paths before render. Case-folded filesystem collisions, reserved OS filenames, JS keywords, path traversal and normalized identifier collisions fail with diagnostic, showing safe IDs and resolution suggestion; no random numbering or order-dependent names. Explicit stable overrides are reviewed and included in input hash.

## Example generated surface (illustrative)

```ts
// policies/types.ts — generated, do not edit
export interface Policy { id: string; status: "active" | "inactive" }
export interface ListPoliciesInput { page: number; pageSize: number }
// ListPoliciesResult uses shared runtime pagination type as defined in S0-06.
// policies/service.ts exports listPolicies(input, options?) using shared Fetch.
// policies/queries.ts exports query key, options, hook; schemas.ts exports validators.
```

Direct and proxy use same exposed signature; transport target differs. Generated browser source cannot embed server URLs, resolved credentials, private upstream config, server-only policy registry or sensitive examples. The generated service delegates transport behavior to runtime package; no duplicated Fetch machinery. Query/mutation wrappers use public service types and explicit invalidation config, no guessed invalidation. Generated types represent exposed responses, not upstream wrapper. Runtime and generated Zod types must agree for supported constraints; fail rather than silently weaken mandatory validation.

## Determinism and verification

Canonicalize structured inputs under IR-V1 (map order, semantic sets, preserved ordered arrays). Canonical byte encoding proposal: RFC 8785 JCS for JSON-compatible values after semantic normalization, reject nonfinite/invalid Unicode and unsupported unsafe numeric semantics rather than silently alter constraints. SHA-256 digest of UTF-8 bytes, hex lowercase with sha256: prefix. Normalize output LF, UTF-8 without BOM and terminal newline; pin formatter and emitter version/options, never embed timestamps, working-directory paths or environment secrets. Inputs include all generation-relevant annotations and projections, selection, config/preset fingerprints and generator/tool versions; exclude runtime-only profile values. Run determinism tests across order changes, operating systems and identical runs. No claim that semantic equality implies byte equality for arbitrary schema rewrites.

Verification before writing: valid plan, unique paths and symbol exports, complete artifact dependency graph, imports resolve to generated symbols or known package exports, parse emitted TS (no execution); supported fixture consumer must typecheck and exercise generated APIs in CI. If a clean consumer typecheck is not available in local apply, report that gate as not run; do not claim verified release. Formatting or parsing error blocks apply. Never shell out to untrusted configured hooks.

## Ownership and file operations

The tracked frontspan/frontspan.lock.json records exact relative artifact paths, kind, owners and SHA-256 byte digest from last successful generation. Marker comment is advisory only; a marker or filename does not establish ownership. Inspect actual bytes and path type; reject symlinks and nonregular files, case-fold/path collisions, writes outside root, protected roots and stale revisions. Do not recursively clean directories. For each planned path:

| Baseline ownership | Actual file | Plan | Result |
|---|---|---|---|
| absent | absent | present | create |
| absent | present | present | conflict, even if marker or bytes match |
| present | digest matches baseline | same bytes | unchanged |
| present | digest matches baseline | different bytes | update |
| present | digest matches baseline | absent | delete candidate, subject to compatibility/approval |
| present | differs | any | conflict; do not overwrite/delete |
| present | missing | present | conflict; explicit restore action |
| present | missing | absent | conflict; explicit reconcile |

Unknown files not in plan or manifest remain untouched; warn if they reside under generated root. Missing/invalid lock with existing generated files fails safe; explicit bootstrap/adoption workflow may be designed later, never infer ownership. First generation with empty destination and no lock creates baseline; no automatic adoption. Restore or reconcile requires separately previewed explicit action and reviewed exact hashes; no generic force/clean flag in MVP. Manual edits are not merged via three-way merge; move custom code outside generated root and explicitly restore only after preserving user changes. Lock must not be treated as security trust root; protected CI and Git review remain necessary.

## Recoverable apply

Local writer uses one exclusive per-project lock shared with Studio/config transactions; fail if busy, stale lock recovery requires checking journal and explicit recovery. Use validated project-local staging area on same filesystem, unique transaction ID (local only), expected old digests/config revision and expected absence for creates. Stage final bytes and original bytes for affected owned files, persist journal before mutation. Revalidate canonical paths/symlink boundaries and expected hashes immediately before each change, including lockfile; use exclusive creation/no-clobber for new paths and atomic per-file rename where supported. Do not follow links. External IDE edits cannot be prevented by advisory lock; recheck and fail closed, avoid claiming multi-file atomicity or race-free behavior on hostile filesystems. Supported local filesystems and OS-specific safety primitives require spike. Write lockfile last with expected revision, mark committed and clean staging only after successful verification. Journal contains paths, expected old/new digests, phase and rollback data references, not secrets; local transaction directory ignored by Git and access restricted. On interruption, block new writes, compare actual state to journal, roll back only bytes still matching transaction output or finish verified committed cleanup; conflicts preserve files and require manual recovery. Never overwrite an unrelated concurrent edit during rollback. Simulate process failure between every phase in tests. Git rollback is preferred for already committed completed transactions; revalidate restored config, snapshot and manifest as a unit.

## Required tests (planned, not run)

- Same canonical inputs and tool versions produce identical bytes and digests twice, including recursive schemas and reordered semantically unordered keys.
- Selected schema closure and domain/shared symbols resolve; empty modules omitted; generated fixture typechecks.
- Path, case, symbol and reserved-name collisions fail before any writes; untrusted descriptions cannot inject code.
- Modified owned, missing owned and unknown colliding files fail; unchanged files preserved; obsolete verified owned files removed only after compatible classification or approval.
- Preview/check do not write files, including caches/lock/journal; failed parse/render leaves prior state.
- Concurrent config edit, stale lock, mid-apply failure, recovery conflict, symlink escape and interrupted lockfile write preserve user data.
- Source/exposed contract normalization and no server-only credentials in browser artifacts.

See [Intelligent sync v1](SYNC-V1.md) for baseline and approval rules.