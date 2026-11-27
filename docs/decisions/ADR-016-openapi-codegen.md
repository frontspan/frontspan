# ADR-016 — OpenAPI import and generation architecture

Status: Accepted by maintainer on 2026-11-27; parser adoption remains conditional on verification. Date: 2026-11-27.
Issue #3; D-04 and preliminary D-06. See [research](../research/OPENAPI-CODEGEN.md).

## Accepted decisions

1. MVP accepts Swagger 2.0, OAS 3.0.x and 3.1.x JSON/YAML with an explicit supported-feature matrix; reject 3.2 and unsupported selected-operation features rather than silently downgrade. Webhooks/callbacks/streaming and arbitrary dialects outside initial scope. Support common HTTP JSON, multipart/binary and empty responses as specified in S0-04/06; do not promise every JSON Schema keyword.
2. Adopt Scalar as primary parser/validator/upgrade candidate behind a Frontspan-owned adapter; final dependency pin and adoption contingent on synthetic compatibility/security spike. Retain original version and provenance. Validate original version before any conversion, normalize via version-aware adapters or verified upgrade, and validate canonical semantics. No implicit lossy repair, explicit diagnostics for known nonconformant documents. Fallback evaluate separate version adapters if upgrader changes semantics.
3. Own a versioned, JSON-serializable IR separate from parser-specific types. Separate source contract and exposed contract (mapping/proxy), stable resource/operation/schema IDs and provenance; schema graph references preserve cycles. Schema resolution is not full recursive dereference. Unsupported or unresolved selected-schema refs fail generation; never substitute permissive empty schema or any silently.
4. Stages: trusted configured input loader → bounded parse → original spec validation → controlled reference graph → normalization → selection and transitive closure → exposed contract projection → generation plan → render → verify → apply. Structural validation and schema dialect support are distinct. Deterministic naming, dependency and import ordering; preserve order where semantically relevant.
5. Use typed internal generator interfaces and a small language-neutral plan/file artifact contract; built-in generators for types, services, TanStack Query, Zod and barrels. Prefer hybrid generation: structured TypeScript declarations/expressions where complex and small controlled text templates for boilerplate; compiler API isolated behind emitter interface, no code injection via raw spec text. No third-party arbitrary generator plugin execution in MVP. AST vs template choice and exact emitter library subject to S0-05 specification and spike.
6. Fixed domain layout; source-owned generated files with ownership manifest and content digests. Plan first, preview/diff, validate paths and output, then apply staged writes. No recursive directory wipe; unknown/modified files conflict; remove only verified obsolete owned artifacts. Exact manifest, crash recovery, concurrency and approval rules deferred to S0-05. Studio and CLI share same engine, no separate logic.
7. Default deny external refs, including filesystem paths and remote URLs. Explicit approved local roots can enable bounded local files; realpath/symlink containment, pointer validation and resource limits required. Remote refs deferred for MVP; configured root URL imports distinct from untrusted refs. If root URL import is enabled, use approved URL policy, HTTPS, redirect and DNS/IP validation, no private/link-local/metadata destinations unless an explicitly authorized private resource policy permits specific destinations, no credential forwarding to other origins, time/byte/depth limits and redacted diagnostics. No implicit network requests by parser or dialect resolution. Verify blocked loads in tests; no parser library trusted by default.
8. Use stable diagnostics with source URI/pointer, code/severity and operation/schema identity. Fail safely before writing on errors affecting selected closure. Warnings and unsupported unused portions have explicit policy. No secret values in snapshots, diagnostics or logs.

## Alternatives

- Full custom parser: unnecessary spec maintenance and security burden.
- Depend on Orval/Hey API generator: faster initial generation, but constrains exposed-contract semantics and ownership/sync; rejected by accepted custom engine direction.
- Full dereference: loses symbolic identity, may explode recursive graphs.
- Pure string templates: simpler but fragile for nested type syntax; pure compiler AST ties boilerplate to tool API; hybrid reduces coupling.
- General third-party plugin ecosystem: useful later; avoid early security and public API commitment.

## Acceptance and remaining work

Maintainer approval establishes direction only. No dependency installed, fixture run, runtime benchmark or certified spec compatibility. S0-04 defines concrete IR schema, feature support and diagnostics; S0-05 defines emitters/ownership/sync; S0-06 defines transport and URL security; S0-08 authors fixtures. Spike must verify exact Scalar package behavior/versions/licenses, supported schemas, blocked external IO, bounded parsing and deterministic round-trip; if unsuccessful, return to maintainer with alternatives. Do not implement before applicable approved contracts.
