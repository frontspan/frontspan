# Next.js proxy and enterprise governance v1

Status: accepted design baseline under ADR-019; implementation and verification pending. S0-06 (#6). ADR-007/016/017/018 apply. This is a threat model and implementation contract, not a security certification.

## Trust boundaries

Browser inputs, imported API documents and upstream responses are untrusted. Existing app authentication and upstream authorization remain authoritative; configured endpoint registry does not grant permission. The deployed server, reviewed auth adapter, protected build and policy trust root are trusted. Malicious developer/deployment administrator who can change runtime code or infrastructure is not contained by a library alone. Direct mode only for explicit public browser-reachable resources where upstream enforces access; no credential or field-security claim from client validation. Managed identity, refresh, RBAC/ABAC policy engine, composite flows, generic server credential elevation, background jobs and arbitrary proxying are outside MVP.

Next.js App Router Node runtime. App installs a catch-all route handler under /api/frontspan/[...path]/route.ts using server-only adapter; explicit registry of configured method + route templates, no arbitrary URL/method/headers from browser. Reject ambiguous/duplicate normalized paths at startup; reject encoded separators/dot traversal, double decoding, unsupported methods and ambiguous matches. Unknown route 404, known path disallowed method 405 with safe Allow; do not expose registry inventory. HEAD and OPTIONS only declared/approved, no implicit unauthenticated bypass; CORS preflight handled explicitly if future approved cross-origin policy. Route handler delegates to same executor used by trusted SSR, with same required auth/policy checks. Registry built from validated pinned effective config and exposed IR, only server config references; resolve runtime env on server startup, validate before accepting traffic. Next runtime/server-only exports and no-store fetch, no shared data or route cache; private/no-store response headers on authenticated and proxy responses, do not use use cache for these. Verify framework behavior in Next 16 production build incl cache components compatibility; not assume route config flag alone sufficient.

Illustrative integration (names subject to implementation):
```ts
import { createFrontspanHandler } from "@frontspan/next/server";
import { registry, authAdapters } from "@/server/frontspan";
export const runtime = "nodejs";
const handler = createFrontspanHandler({ registry, authAdapters });
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
```
Only registered routes/methods execute; actual exported method handlers depend on app integration and validated registry. App supplies server-only registry and adapter functions; no automatic import or execution of arbitrary config JS.

## Authentication and authorization

auth kind none or forward as ADR-017. Default fail closed: none permitted only explicitly public endpoint/resource and policy allows. Forward adapter uses existing application session validation or verified credential context; must not treat presence of Authorization or cookies as authentication. Auth adapter contract proposal:
```ts
interface VerifiedPrincipal {
  subject: string;
  tenant?: string;
  cacheScope: string;
}
interface AuthAdapter {
  authenticate(context: TrustedRequestContext): Promise<VerifiedPrincipal | null>;
  authorizeEndpoint(context: { principal: VerifiedPrincipal; endpointId: string }): Promise<boolean>;
  upstreamHeaders(context: {
    principal: VerifiedPrincipal; endpointId: string; resourceId: string;
  }): Promise<Headers>;
}
```
TrustedRequestContext is server-controlled request/session context, never a client-constructed identity. Existing application supplies explicit endpoint authorization callback or reviewed policy delegating to upstream where safe; authenticate then authorize before upstream IO, null/deny/error fails closed (401/403 or generic internal error). Upstream remains final record/field/tenant authority. No trust in client role/tenant headers. Adapter creates only approved credential/header names for exact resource origin; no blanket forward cookies, Authorization, X-Forwarded-* or proxy headers. Do not convert user token to more privileged service token; if user credential forwarding cannot preserve authorization, block integration until reviewed adapter. No own session store/JWT issuance/refresh. Separate per-request context, no global identity. Protected upstream error never echoed; upstream Set-Cookie/Location not forwarded. Authenticated responses contain only exposed public contract fields; if sensitive field restrictions required, upstream enforce or reviewed explicit server allowlist projection and mandatory validation. General dynamic field/record policy engine deferred V2.

## Destination / SSRF policy

Destination originates only from approved resource configuration, not OpenAPI servers, client input or arbitrary URL parameter. Approved exact scheme/host/port and allowed path prefix per environment/resource; HTTPS by default. Explicit private enterprise backend destinations allowed only by separately reviewed policy (exact host/port and approved IP ranges; no broad private network permission); metadata, loopback/link-local and otherwise prohibited special-use destinations denied, local synthetic fixture exception isolated to test harness only. Resolve all IPv4/IPv6 addresses and validate at connection time; no DNS rebinding via second unchecked resolution. Native Fetch alone is insufficient to guarantee validated DNS-to-socket binding. Require controlled Node transport connector/dispatcher with validated resolution and TLS hostname/SNI/certificate checks, or a trusted enforcing egress proxy/network boundary providing equivalent guarantees; evaluate exact integration in security spike. Block proxy deployment until proven. Redirect disabled, no implicit proxy env bypass, no protocol downgrade, userinfo or fragments. Build URL from fixed destination/path template and validated encoded segments; preserve configured prefix, verify resulting origin and path; no client-controlled host/port. Egress allowlist and network isolation defense in depth. Apply same loader policy to configured OpenAPI root URL imports, with distinct import destination/credential policy; remote refs remain denied. No implicit parser fetch or external schema resolution. Private destinations never included in generated client artifacts or public repo.

## CSRF, request and response boundaries

Default same-origin browser BFF; no permissive CORS, no reflection of Origin, no cross-origin credentials. For cookie/ambient-auth state-changing requests require exact trusted origin (from deployment config, not untrusted Host/X-Forwarded-Host), reject missing/null/cross-site Origin unless explicit reviewed non-browser or token fallback, and app-provided server-validated CSRF token bound to session. SameSite cookie and Fetch Metadata are defense in depth, not sole control. Non-browser SSR executor uses trusted request-scoped identity, not client-controlled bypass header. Bearer-only integration still validates auth and origin policy as configured; safe methods must not mutate state; no CSRF exemption if GET endpoint has side effects (reject as unsafe or require explicit design). CORS alone not CSRF mitigation.

Strict input/media/size/deadline validation; bounded parsing before expensive validation; reject unknown/duplicate prohibited headers and malformed request. Rate limit at trusted deployment gateway or app adapter; no distributed rate limiter promised. Default proposed operational caps: timeout 15s, hard max 30s, retries 0 default, max 2 retries on eligible reads within total deadline, JSON 1 MiB request / 5 MiB response, binary or multipart 10 MiB bounded, configurable only within approved policy; cap decompressed bytes and multipart parts, header count/length and concurrency at infrastructure or runtime. Caps are starting proposals, not measured; pilot must verify and adjust explicitly. No arbitrary passthrough body or upstream headers. Strip hop-by-hop headers, Set-Cookie, redirects, raw errors, untrusted Content-Disposition; explicit safe response headers, no-store/private, nosniff, safe attachment. Do not serve active content inline. Normalize HTTP 400 invalid input, 401 missing auth, 403 deny, 404/405 route mismatch, 413 oversized, 415 unsupported media, 429 limit, 502 upstream invalid/unavailable, 504 timeout; preserve approved upstream business status mapping only; never relay raw error body. Auth/authorization failures not retryable.

## Governance trust root

Preset JSON defaults and restrictive constraints from ADR-017 are not enforcement by themselves. Organization maintainer controls approved package versions, mandatory preset identity/digest and policy minimum through protected repository rules and/or trusted reusable workflow pinned outside consuming PR control. Validate exact installed preset content against trusted expected digest (not an editable lock alone), fail on removal/replacement/weaker policy or disabled required runtime modules. CI performs configuration schema and semantic validation, all declared environment structural policy checks without secrets, offline codegen/lock verification and diff against protected base, security tests and consuming build. Required review for policy/route/auth changes and breaking/unknown sync, especially changes to CI or trust roots; protect branch, required checks, CODEOWNERS or equivalent rules, no arbitrary PR workflow substitution or privileged fork code. Use deployment trusted artifact + expected policy digest supplied via protected release environment; runtime validates registry/policy and actual environment destinations on startup, fails closed if missing/mismatched; every execution enforces endpoint eligibility, auth, limits, mapping and approved destination. No client override, no runtime weakening. For standalone OSS usage without organization governance, validate local configuration but label assurance local only; cannot claim enterprise enforcement. No own control plane or hosted policy service. Exact GitHub ruleset/private preset distribution and deployment trust integration require Sprint 1 and pilot configuration; current repo docs are not actual enforced controls.

## Threat table and planned tests

| Threat | Required mitigation | Verification |
|---|---|---|
| Arbitrary proxy / SSRF / rebinding | explicit registry, origin/port/path and connection IP enforcement, no redirects | reject unknown routes, private/metadata not approved, DNS change/redirect, alternate IP encodings |
| Credential forwarding leakage | per-resource allowlist and verified caller adapter | malicious header, unrelated origin, redirect and response Set-Cookie tests |
| Broken auth / IDOR / tenant spoof | authenticate, endpoint gate, upstream authoritative record/tenant check | unauthenticated and denied before IO, cross-tenant fixture, SSR same gates |
| CSRF | same-origin, session-bound token, reject missing/invalid Origin | cross-site, null/missing origin, token mismatch, trusted SSR |
| Cache isolation | no shared server cache; per-request SSR and auth-scoped QueryClient | two identities/tenants, logout pending result, Next production cache test |
| Path/header injection | strict route/encoding and header allowlists | traversal, encoded separator, duplicate header, malformed media |
| Sensitive field leakage | server-side explicit exposure/validation, redacted errors/logs | hidden fields in body/errors/hydration, malicious upstream text |
| Denial of service | byte/depth/time/attempt/concurrency limits, gateway rate limit | oversized/decompressed payload, stalled body, retry budget, parallel requests |
| Policy bypass | protected expected digest, required checks/review, runtime verification | modified lock/preset, missing mandatory preset, weakened profile, bad deployed config |
| Code injection via spec | parser/ref guards and emitter escaping ADR-016/018 | hostile descriptions, malicious local refs, unsupported keywords |

Source references reviewed 2026-11-28: https://nextjs.org/docs/app/getting-started/route-handlers ; https://nextjs.org/docs/app/api-reference/functions/fetch ; https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html .

No tests, deployment or dependencies. Key blockers: connection-bound DNS/egress enforcement, auth adapter integration with authorized pilot, real Next cache/hydration checks, trusted policy supply and actual protected CI, operational caps validation. No production claim until these pass.
