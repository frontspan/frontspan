# Open technical decisions

Resolve P0 decisions before the related implementation starts. A proposal below is not accepted by default.

| ID | Decision | Priority | Needed outcome |
|---|---|---|---|
| D-01 | Node.js, Next.js, React and TypeScript support matrix; App Router/Node runtime | P0 | supported ranges and compatibility CI |
| D-02 | CLI and Studio stack and local architecture | P0 | process lifecycle, loopback binding, origin/auth, file watching and conflicts |
| D-03 | Configuration schema and precedence | P0 | root/resource/endpoint shape, version migration, hard policy and secret refs |
| D-04 | OpenAPI versions, parser, remote ref policy | P0 | compatibility matrix, cycles, unsupported constructs, SSRF controls |
| D-05 | Normalized IR and schema semantics | P0 | typed contracts for operations, schemas, mapping, security and diagnostics |
| D-06 | Generation approach and ownership | P0 | AST/templates, naming, deterministic emit, stale files, safe writes |
| D-07 | Contract sync and approval | P0 | snapshots/lockfile, diff classification, approval, CI/watch/CLI, rollback |
| D-08 | HTTP/query and normalized response contracts | P0 | transport errors, cancellation, retries, binary/204, pagination, cache keys |
| D-09 | Proxy and existing auth adapter | P0 | route registry, trust boundaries, auth forwarding, CSRF/SSRF, timeouts |
| D-10 | Engineering/toolchain/CI/release | P0 | exact versions, test gates, branch strategy, package scope availability, registry |
| D-11 | Enterprise governance | P0 for enforcement | CI/runtime controls, non-overridable constraints and threat model |
| D-12 | Pilot inputs | P0 | approved anonymized/synthetic fixtures and measurable baseline |
| D-13 | Managed session storage and refresh | V2 | adapters, concurrency, cookies and revocation |
| D-14 | Permission engine and restricted TS | V2 | policy evaluation and actual isolation model |
| D-15 | Mock topology, observability storage | V3 | package-local vs optional shared infrastructure, retention and redaction |
| D-16 | Managed collections/database ownership | V4 | storage, migrations, authorization and audit |
| D-17 | Shared module distribution | V2 | versioned module contracts and sharing mechanism |

Research candidates: Orval, Hey API, Storybook, shadcn/ui, Changesets; future composite/security research may include KrakenD and external auth integrations. Review actual source and licenses; no research has been completed in this baseline.

## Accepted decision follow-up

D-01 and D-10: architecture and target matrix approved in [ADR-015](ADR-015-toolchain-compatibility.md). Exact patches, compatibility tests, npm namespace and publishing bootstrap, CI and ruleset setup remain Sprint 1 or pre-release verification tasks; do not interpret approval as certification.
