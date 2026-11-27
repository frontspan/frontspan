# Frontspan

Configuration-first frontend development toolkit for Next.js.

Frontspan aims to help frontend teams standardize API integration, generate project-owned TypeScript code, and configure a lightweight server-side API layer without replacing existing backend systems.

**Status: Sprint 1 — foundation engineering.** The workspace contains a private package skeleton only. No usable packages or CLI have been released.

## Planned capabilities

- OpenAPI contract import, selective generation and controlled synchronization.
- Typed Fetch clients, TanStack Query integration, Zod schemas and normalized API contracts.
- Local Studio and CLI editing the same Git-tracked configuration.
- Direct and server-side proxy execution with existing authentication integration.
- Versioned organizational presets and independently installable packages.

Composite BFF execution, managed authentication, permissions, forms, tables, observability and managed collections are later-stage capabilities.

## Contributor checks

Use the exact Node version in [`.nvmrc`](.nvmrc) and the pnpm version in [`package.json`](package.json). The root manifest also pins the TypeScript, Turborepo, lint, formatter and unit test tools; [`pnpm-lock.yaml`](pnpm-lock.yaml) records their resolved dependency graph.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

After building, switch to **Node 24.22.3** and run `node scripts/smoke-consumer.mjs` to pack the private skeleton and test its ESM entry point in a fresh offline npm consumer. This smoke does not certify a Next.js, React or generated TypeScript matrix. Changesets and Playwright are deferred until there are release and application fixtures to validate.

## Project documentation

- [Product requirements](docs/product/PRD.md)
- [Scope and acceptance criteria](docs/product/SCOPE.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Decision register](docs/decisions/README.md)
- [Open decisions](docs/decisions/OPEN-DECISIONS.md)
- [Roadmap](docs/planning/ROADMAP.md)
- [Sprint 0](docs/planning/SPRINT-00.md)
- [Sprint 1](docs/planning/SPRINT-01.md)
- [Agent instructions](AGENTS.md)
- [Contributing](CONTRIBUTING.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
