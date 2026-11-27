# ADR proposal — Code generation ownership and intelligent sync

Status: Proposed; maintainer approval required. Date: 2026-11-28. Issue #5; D-06/D-07.
Specifications: [Codegen v1](../specifications/CODEGEN-V1.md), [Sync v1](../specifications/SYNC-V1.md).

## Proposed decisions

- Keep one modular codegen package with pure internal planner/generators/emitters and separate writer. Hybrid structured emitter and controlled templates, no arbitrary plugin execution. Plan symbols, files and dependencies before rendering.
- Fixed domain output; stable names and explicit collision resolution; shared schemas and recursive groups placed coherently. No silent renaming, manual code outside generated ownership.
- Deterministic canonical inputs, pinned toolchain, normalized final bytes and SHA-256. Tracked versioned lockfile records accepted baseline and ownership; approved pinned snapshots for offline generation. Confidential snapshots never public.
- Manifest-based create/update/delete only for verified owned paths; unknown/modified/missing conflicts, no recursive cleanup or generic force. Read-only preview/check. Exclusive local coordination, revision checks, staged writes and recovery journal; no false multi-file atomicity guarantee.
- Diff both source and exposed contracts and generated public surface. Direction-aware compatibility rules, conservative review-required classification when uncertain; invalid inputs cannot be approved. Reverse dependency impact graph; full deterministic replanning in MVP.
- Default preview; opted-in compatible apply only on explicit sync. Breaking and unknown require exact-plan approval and Git governance, stale approval invalid. CI verifies pinned baseline offline and compares protected base for breaking review. No implicit remote drift fetching or writes.
- Git rollback of coherent state, local recovery with content checks. No claims to reverse backend changes.

## Alternatives and consequences

Direct file-writing generators and recursive clean are simpler but risk lost user code. Full partial regeneration increases complexity; full plan with unchanged bytes skipped is sufficient until measured. Pure schema diff or TS compilation cannot prove behavioral compatibility; conservative review increases manual approvals but lowers risk. Live-only Swagger fetch prevents reproducible CI; pinned snapshots require storage/authorization. Local approval digest is not an identity/auth system; CI/runtime enforcement follows S0-06. Emitter library, exact format schemas and filesystem guarantees require verification; S0-07 finalizes CLI and Studio UX, S0-08 fixture evidence. No dependency or implementation introduced.

## Acceptance gates

Approve design before implementation. Sprint 3/4 must implement and test deterministic generation, ownership and recovery, directional compatibility, stale approval and no-write checks. Exact lock/snapshot JSON Schema, output contract tests, compiler/formatter choice and policy/transport integration remain pending.