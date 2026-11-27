# ADR proposal — CLI and local Studio architecture

Status: Proposed; maintainer approval required. Date: 2026-11-28. Issue #7; D-02.
Specification: [CLI and Studio v1](../specifications/CLI-STUDIO-V1.md).

## Proposed decisions

- Commander CLI, React/Vite packaged static Studio UI, Node local HTTP, Base UI/Tailwind, RHF/Zod/TanStack Query for UI, Chokidar watch hints. Exact versions/licenses and package names subject to verification.
- Shared development application services, same config/IR/codegen, no browser filesystem access, no database, no hosted control plane or separate Next dev server.
- Explicit incremental install/scaffold/module plans, local pinned CLI, no overwrites/codemod by default; preserve app ownership and existing package manager.
- Foreground 127.0.0.1 only, exact Host/origin validation, one-time user-mediated pairing with memory-only bearer, no CORS/cookies, strict CSP and bounded typed API. No remote Studio or arbitrary command/file execution.
- Config-first screens; explicit save and exact-plan approval; watcher invalidation only; shared writer lock and revision checks, recovery journal. No auto-save or regeneration.
- Playground selected endpoints only, explicit environment and policy, no impersonation, mutation confirmation and production mutation denied by default. Network functionality blocked until S0-06 security decisions accepted and verified.

## Alternatives and risks

Next.js/Electron/hosted Studio introduce unnecessary process/distribution/trust complexity. Native CLI parsing and polling-only are viable fallbacks. Localhost alone is insecure; token pairing and origin/Host verification essential but cannot protect compromised workstation. Native HTTP implementation needs tests for input bounds and security. Package installation is not fully atomic; report partial failures and avoid destructive rollback. Runtime security controls from PR #17 remain pending; no silent approval.

## Verification

Approve before implementing. No dependencies, UI, server or tests. Sprint 1 CLI foundation and Sprint 5 Studio require cross-platform packaging, local security and file concurrency verification. Exact API types, final caps, naming, pairing UX and authorized playground integration pending.
