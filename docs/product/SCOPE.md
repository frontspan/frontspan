# Release scope

This sequence reflects the requested planning recommendation, not delivery dates.

## MVP — API development with basic BFF

Core/configuration, CLI/scaffolding, shared presets, OpenAPI parser/IR, selective deterministic generation, contract sync, custom Fetch, TanStack Query, Zod, request/response/error normalization, pagination, explicit cache invalidation, local Studio, endpoint testing, direct and basic Next.js proxy execution with existing auth forwarding.

Minimal proxy security, redacted diagnostics, safe request limits and CI verification are mandatory for pilot. No managed identity/session service. No unrestricted arbitrary upstream proxy.

### MVP acceptance gates

- A representative existing Next.js application integrates incrementally without rewrite.
- A supported synthetic contract generates compiling domain-organized TypeScript; identical inputs produce identical files.
- Selected operations include necessary referenced models. Unsupported constructs produce explicit diagnostics.
- Contract sync distinguishes supported compatible vs breaking changes; no manual file loss; CI detects stale output.
- Studio and CLI use the same schema, preserve valid changes and surface concurrent edit conflicts.
- Direct and proxy sample flows work, including authentication forwarding with no secrets shipped to the browser.
- Mapping, pagination, runtime validation and normalized errors have fixture-based tests; binary/204 handling is specified.
- Pilot uses approved/synthetic fixtures and measures integration effort; maintainers approve results.

## V2 — Security and composite BFF

Composite execution, reusable modules, hierarchical resilience/cache policies, managed sessions, JWT, typed permissions and server-side field restrictions. Restricted TypeScript requires a reviewed isolation design; not an in-process security promise. Existing authentication authority remains external.

## V3 — Application toolkit

React Hook Form and Zod integration, headless TanStack Table, URL synchronization, i18n integration, mock capabilities, native observability and execution-flow visualization. Mock topology and telemetry storage must be reassessed under package architecture.

## V4 — Managed resources

Authorized database connections, managed collections, data model/CRUD and record management. No database ownership or migration architecture has been agreed.

## Non-goals

Feature flags, UI/form/page/navigation builders, application-wide client state framework, general-purpose backend replacement, scheduled/background jobs, queues/webhooks/event orchestration, central SaaS control plane, billing and additional frontend framework adapters for initial release. No full CMS publication or multilingual content workflows.
