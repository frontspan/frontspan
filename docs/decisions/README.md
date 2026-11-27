# Decision register

Accepted means previously agreed in product discovery; proposed means a recommendation requiring review. This initial register is not a substitute for detailed ADRs.

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Next.js-first package ecosystem, no required hosted control plane | Accepted |
| ADR-002 | Hybrid ownership: shared npm runtime and project-owned generated frontend code | Accepted |
| ADR-003 | Git-first modular JSON, local Studio and CLI share configuration | Accepted |
| ADR-004 | Custom code generation engine with normalized IR; standard parser libraries allowed | Accepted |
| ADR-005 | Selective domain-based generation and intelligent contract sync | Accepted |
| ADR-006 | Fetch transport, TanStack Query, Zod and normalized contracts; explicit cache invalidation | Accepted |
| ADR-007 | Direct and embedded proxy/composite modes; authoritative backend security | Accepted |
| ADR-008 | Versioned shared presets with project overrides subject to mandatory policy | Accepted |
| ADR-009 | Separately published packages in a monorepo with unified versioning | Accepted |
| ADR-010 | GitHub, public Frontspan repository, Apache-2.0 license | Accepted / repository verified |
| ADR-011 | Turborepo, pnpm, Changesets, Vitest, Playwright | Accepted via ADR-015; exact versions pending |
| ADR-012 | MVP API development + basic BFF; later security/application/managed-resource phases | Planning recommendation for review |
| ADR-013 | Public registry for generic packages, private organizational extensions | Accepted via ADR-015 |
| ADR-014 | Headless form/table/i18n integrations; no UI builders or app-wide state mandate | Accepted |
| [ADR-015](ADR-015-toolchain-compatibility.md) | Runtime targets, ESM, engineering stack, CI and release policy | Accepted; verification pending |
| [ADR-016](ADR-016-openapi-codegen.md) | OpenAPI import, parser adapter, IR, hybrid generation and safe ownership | Accepted; verification and detailed contracts pending |
| [ADR-017](ADR-017-config-ir-v1.md) | Configuration v1, merge and policy semantics, normalized source/exposed IR | Accepted; implementation and verification pending |

| [ADR-018](ADR-018-codegen-sync-v1.md) | Deterministic generation, ownership, lockfile, contract sync, approvals and recovery | Accepted; implementation and verification pending |

## ADR-001 to ADR-009 — rationale and implications

- **001:** Embedding in consuming Next.js projects lowers operational overhead and preserves existing deployment/network ownership. No mandatory central runtime; future standalone adapter is not committed.
- **002:** Shared runtime can be upgraded as a package, while generated types/services/hooks remain inspectable and owned by the consuming project. Sync must preserve handwritten code.
- **003:** Git review and rollback are the configuration workflow, not a substitute for runtime audit. No secrets in tracked files.
- **004:** Own the IR and generation behavior; study existing tools rather than bind product design to them. Use proven parsing libraries where suitable and honor licenses.
- **005:** Generate only selected operations and required models into fixed domain folders. Compatible changes may be applied automatically; breaking changes require explicit approval. Classification and approval design accepted in ADR-018; implementation and verification pending.
- **006:** Use native Fetch, standard error/response contracts, generated query/mutation helpers and Zod; cache invalidation is explicitly declared, not guessed. Required security validation cannot be disabled.
- **007:** Direct execution is conditional on upstream enforcement; proxy and composite execution must preserve caller identity and avoid increasing upstream privileges. UI wrappers are presentation only.
- **008:** Shared presets are pinned by projects; local overrides are bounded by hard policy. Enforcement mechanism is pending.
- **009:** One release version across independently installable packages simplifies compatibility and avoids requiring every module. Release mechanics and peer ranges need specification.

For future ADRs record: status, context, alternatives, decision, consequences, security implications, and links to affected issues. Supersede rather than silently rewrite accepted decisions.
