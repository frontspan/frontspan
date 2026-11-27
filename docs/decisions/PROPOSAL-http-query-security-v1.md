# ADR proposal — HTTP, Query and secure proxy v1

Status: general architecture direction approved by maintainer; detailed contracts and newly introduced security controls proposed for review. Date: 2026-11-28. Issue #6, D-08/D-09/D-11.
Specifications: [HTTP and Query](../specifications/HTTP-QUERY-V1.md), [Proxy and Governance](../specifications/PROXY-GOVERNANCE-V1.md).

## Decisions

Existing approved direction: Fetch, normalized responses/errors, TanStack Query optional with key/options/hooks, Zod validation, Next.js Node embedded proxy, existing authentication authority, explicit cache invalidation and mandatory enterprise controls.

New detailed proposals: page-based public one-based pagination and page infinite queries; cursor deferred; typed error status nullable for local errors, void/limited binary; grouped input and restricted request body pointer mapping; retry disabled by default, one owner, read-only opt-in; no shared server cache, request-scoped SSR and auth-scoped browser QueryClient; explicit endpoint authorization callback, no privilege escalation, cookie mutations require session-bound CSRF token plus trusted origin; approved per-resource destination and connection-bound DNS or equivalent trusted egress, no redirects; protected external policy digest/CI and deployment trust root; bounded initial request/response sizes and deadlines.

## Alternatives and consequences

Axios unnecessary; double retries unsafe; generic proxy, blind header forwarding and client-only permissions unacceptable. Shared server cache and implicit invalidation risk data leakage or stale results. Cursor pagination adds contract surface; defer instead of pretending totals exist. Connection-time validation cannot be guaranteed by a pre-Fetch DNS lookup; proven transport or egress required. Cookie CSRF integration imposes app requirements, necessary for safe existing session forwarding. Local preset alone cannot enforce organization policy; trust protected deployment and CI. No claim of isolation against malicious administrator.

## Review and verification

Maintainer approved the general direction in conversation; newly specified security-critical behavior remains review-gated per AGENTS.md. No dependencies, implementation or tests. Exact cap values are starting proposals, not measured. S0-07 may proceed on independent CLI/Studio design; implementation and proxy pilot blocked until applicable detailed decisions approved and security/compatibility gates verified.