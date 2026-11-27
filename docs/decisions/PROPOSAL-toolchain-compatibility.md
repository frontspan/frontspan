# ADR proposal — Toolchain, compatibility and releases

Status: Proposed; maintainer approval required.
Date: 2026-11-27. Issue: [#2](https://github.com/frontspan/frontspan/issues/2). Covers D-01/D-10.
No compatibility tests have been run and no dependencies have been installed.

## Context and proposed matrix

Frontspan is a library/toolkit, not a single deployed application. Separate contributor tooling from supported consumer runtimes. Require security-patched releases; exact dependency pins are selected and committed with the Sprint 1 lockfile after smoke tests.

| Component | Contributor baseline | Consumer target (not yet certified) |
|---|---|---|
| Node.js | 26 LTS | 24.x or 26.x (engines: ^24.0.0 or ^26.0.0; validate supported patch floor) |
| Next.js | 16.x | 16.x App Router, Node.js runtime |
| React and React DOM | 19.3.x paired with Next.js | 19.2.x or 19.3.x, subject to peer and integration tests |
| TypeScript | 6.0.x initially for compiler API ecosystem; 7.x evaluation | generated types compile on 5.9.x, 6.0.x and 7.0.x candidates |
| pnpm | 11.x, exact pin | consumers can use npm/pnpm/yarn; CLI must not assume pnpm outside this repository |
| Turborepo | stable compatible release, exact pin | not required in consumer projects |

Node 26 is Active LTS, 24 is Maintenance LTS, 22 reaches EOL April 2027. Exclude 22 for MVP unless an authorized pilot demonstrates need. Next.js official support table lists 16 as Active LTS. React 19.3 is released. TypeScript 7.0 is stable but lacks the previous compiler API; use 6.0 for initial authoring/tooling and explore 7 as optional typechecking after verifying eslint/codegen compatibility. Do not bind the IR to a TypeScript compiler implementation. pnpm 11 supports both target Node lines; newer major adoption is not required for MVP. Pages Router, Edge, Bun/Deno and canary releases are out of scope. Revisit after pilot.

## Package build and exports

Propose ESM-only published JavaScript plus .d.ts declarations, no raw TypeScript execution requirement and no dual CJS bundle initially. Explicit package exports and types, strict TypeScript, NodeNext for Node libraries, bundler resolution for application code. Compile small library packages with tsc initially; introduce bundling only with measured need (CLI or Studio assets). Use separate server/client public subpaths and Next.js server-only boundaries; generated browser modules must not import server dependencies. Verify pack/install in a clean Next.js app, standalone Node ESM import and negative server-import checks. CJS compatibility is not promised (Node's require(esm) behavior does not constitute supported CJS output).

React, React DOM and Next.js are peers only in relevant packages; TanStack Query and Zod peers when public types or shared runtime identity require them. Avoid duplicating React. Internal runtime dependencies use workspace:* or workspace:^ as appropriate and verify published manifests replace workspace protocols; unified internal release compatibility enforced and tested. No blanket dependency on every module. Proposed scope @frontspan/* and CLI bin frontspan; unscoped package name and scope ownership not verified.

## Engineering standards and CI

Propose pnpm workspaces, Turborepo task DAG, Changesets fixed release group, TypeScript strict, ESLint flat config + Prettier, Vitest and Playwright. Alternative Biome is reasonable but ESLint provides familiar framework/type-aware ecosystem; verify compiler API support. Exact lint/test versions pending Sprint 1 compatibility spike. Use local turbo cache initially; remote cache optional. Root scripts planned: pnpm lint, pnpm format:check, pnpm typecheck, pnpm test, pnpm build, pnpm test:integration, pnpm test:e2e, pnpm test:pack. These commands do not exist yet.

PR checks: pnpm install --frozen-lockfile; lint/format/typecheck/unit/build on Node 26; integration and packed-package tests on Node 24/26; generated fixture typechecks across proposed TS lines; Next integration on compatible React pairs; Playwright on representative app once implemented. Linux primary runner; add Windows/macOS CLI smoke tests as CLI matures. Separate PR workflow from privileged release workflow. Read-only default token, SHA-pinned actions, no privileged execution of fork PR code, no publishing secrets in PR jobs. Required checks and review on main via rulesets, no force-push; issue-specific short-lived branches/worktrees, squash merges preferred. Authorized documentation merges follow AGENTS.md; implementation requires CI and review.

## Release proposal

Public npm registry for generic packages, private registry for organization-specific extensions. Changesets fixed group for all public Frontspan packages (not private apps) so every released package shares version. Start at 0.x, explicit change notes and breaking changes; use release PR and maintainer-approved release job. Build/pack/test before publish, validate manifests, publish in dependency order, verify versions and tags. npm trusted publishing via GitHub Actions OIDC with provenance for public packages; restrict id-token: write to publishing job and use protected approval/environment where available. First package creation and trusted publisher setup require npm owner action; do not assume names or credentials exist. No package publish without explicit maintainer approval. Handle partial publication by reconciling registry state and publishing missing immutable versions; never overwrite existing versions. Tag release after verification.

## Alternatives and unresolved work

- Node 24-only authoring: mature ecosystem but misses active LTS baseline; Node 26 with 24 compatibility preferred.
- Dual ESM/CJS: increases build/exports and testing surface; revisit if pilot requires.
- TypeScript 7-only: faster compiler but tool API compatibility risk; prefer TS6 initially, evaluate TS7 separately.
- Independent package versions: rejected by ADR-009; fixed group is appropriate.
- Exact toolchain patches, package scope/CLI name ownership, real consumer compatibility, ruleset/CI availability, npm bootstrap and workflow tests remain open. No security or CI enforcement currently installed.
- Acceptance requires maintainer approval of this proposal, then Sprint 1 implementation/verification.

## Sources (reviewed 2026-11-27)

- Node release schedule: https://github.com/nodejs/Release
- Next.js support and installation: https://nextjs.org/support-policy ; https://nextjs.org/docs/app/getting-started/installation
- React releases: https://react.dev/blog
- TypeScript 7 and API compatibility: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- pnpm compatibility and v11: https://pnpm.io/installation/ ; https://pnpm.io/blog/releases/11.0
- Turborepo support: https://turborepo.dev/docs/support-policy
- Changesets fixed group: https://changesets.dev/guide/fixed-packages
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers/
- GitHub Actions secure use: https://docs.github.com/en/actions/reference/security/secure-use
- Vitest prerequisites: https://vitest.dev/guide/
