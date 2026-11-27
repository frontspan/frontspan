# Product requirements — Frontspan

Status: initial baseline for maintainer review. Target: enterprise frontend teams, initially validated in an authorized real Next.js project. Public, general-purpose toolkit; private organizational adapters/presets are separate. No industry-specific assumptions.

## Problem and product boundaries

Frontend teams repeatedly integrate existing APIs, reconcile changing contracts, implement transport and cache conventions, and coordinate security boundaries. Frontspan reduces repeated infrastructure work and keeps the project in control. Domain business logic, authoritative identity and data ownership remain with backend systems. Frontspan is not a hosted CMS, generic backend platform, UI builder or SaaS control plane.

## Actors

- Frontend developer: imports contracts, selects endpoints, configures behavior, generates and tests clients.
- Maintainer/architect: owns preset versions, reviews changes and policy enforcement.
- Backend team: owns upstream contracts, business rules and authoritative access control.
- Application end user: uses the consuming application, not Studio.

## Requirements

| ID | Requirement | Release target |
|---|---|---|
| FR-01 | Incrementally install modules into existing Next.js projects or scaffold a new project. | MVP |
| FR-02 | Import API descriptions and normalize into an internal contract model; select services/tags/operations with transitive types. | MVP |
| FR-03 | Generate project-owned domain-organized types, services, query/mutation hooks and options, query keys and validation schemas. | MVP |
| FR-04 | Detect contract changes, auto-apply compatible changes under configured workflow, require approval for breaking changes and preserve manual code. | MVP |
| FR-05 | Standardize Fetch transport, cancellation, timeouts, errors, pagination, response/request mapping and configurable validation. | MVP |
| FR-06 | Provide CLI and local Studio over the same modular Git-tracked JSON configuration. | MVP |
| FR-07 | Test endpoints via a local playground, with redacted results and contract checks. | MVP |
| FR-08 | Support direct API integration and basic embedded Next.js proxy with existing authentication forwarding. | MVP |
| FR-09 | Version shared presets and allow bounded overrides. Mandatory security constraints cannot be weakened. | MVP foundation; governance enforcement design pending |
| FR-10 | Interpret composite workflows: conditions, sequential/parallel steps, bounded iteration, transformations, reusable modules; request-response only. | V2 |
| FR-11 | Integrate external authentication, JWT, server-managed sessions and refresh; role/claim mapping, endpoint/action/record/field permissions and typed UI wrappers. | V2 |
| FR-12 | Integrate headless React Hook Form, TanStack Table, URL state and i18n; application owns UI and translations. | V3 |
| FR-13 | Native observability, request tracing, masking and mock scenarios; storage/topology unresolved. | V3 |
| FR-14 | Authorized external database access and managed collections with schema, CRUD and admin records; storage ownership unresolved. | V4 |

## Workflow

Install or scaffold → configure API resource → import/select operations → choose direct or proxy → configure mapping/validation → test → generate → consume typed services/hooks → detect contract changes → review changes → commit and deploy through existing CI.

## Non-functional requirements

- Git-first, no required central control-plane service, deterministic generation.
- Modular installation, shared versioning and explicit public contracts.
- Server-only credentials, least privilege, deny by default where Frontspan enforces policy; direct mode relies on backend enforcement.
- Client display wrappers never replace server authorization. Field filtering must occur before data leaves the server when proxy mode provides it.
- Cache isolation for user/tenant-sensitive data, bounded retries, safe idempotency; no cross-user leakage.
- Local Studio must not expose the filesystem or credentials to arbitrary origins.
- Compatibility, failure behavior, performance budgets and supported OpenAPI/Next.js versions require technical specifications before implementation.
- No mandatory vendor service or hosted storage in the baseline.

## Success metrics

Pilot: compare manual vs generated integration time for representative read, paginated and mutation endpoints; measure sync effort and review defects. Record baseline and results; numeric targets to be agreed before pilot. No claim of time savings until measured.
