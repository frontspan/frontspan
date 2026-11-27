# HTTP and query contracts v1

Status: proposed S0-06 (#6), following approved runtime direction. ADR-006/007/017/018 apply. All snippets are design examples; no packages or tests executed.

## Runtime boundary and API

http is framework-independent Fetch transport and shared public error/response types. query adds TanStack Query v5 options/key helpers, next owns Node-only registry and execution. Generated services use exposed contract; no parser, codegen or server secrets in browser. No global mutable auth headers or process-wide user cache. Browser direct services call approved public base URL and use existing app auth; proxy services call same-origin routes. Server Component proxy prefetch uses explicit request-scoped server executor bound to same validated registry and auth context, not a public URL round trip or a bypass. Server-only entrypoint cannot be imported in client bundles. The snippets below use a bound service/options factory in SSR; final generator signatures must preserve transport context.

```ts
interface ApiResponse<T> { data: T }
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number; pageSize: number; totalCount: number; totalPages: number;
    hasNextPage: boolean; hasPreviousPage: boolean;
  };
}
interface ApiError {
  status: number | null;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  correlationId?: string;
  retryable: boolean;
}
interface RequestOptions { signal?: AbortSignal }
interface BinaryResult {
  bytes: ArrayBuffer;
  contentType: string;
  filename?: string;
}
```

Promise resolves typed success or rejects an Error implementing ApiError (not an unsafe raw upstream error). JSON proxy error wire body is {error: ApiError}; clients revive to Error, not raw objects. status is actual HTTP status when response received, null for local network/cancel/timeout without HTTP response; proxy maps its own upstream failures to public HTTP status. No raw stack, body, headers, upstream URLs or tokens in error messages or logs. Stable codes e.g. NETWORK_ERROR, REQUEST_CANCELLED, TIMEOUT, HTTP_ERROR, INVALID_INPUT, INVALID_RESPONSE, UNAUTHENTICATED, FORBIDDEN, RATE_LIMITED, UPSTREAM_UNAVAILABLE. Known backend code/field errors may be mapped by approved rules to bounded safe strings and exposed input field names; otherwise generic message. Do not reflect arbitrary upstream error text. Generate correlation ID server-side; accept inbound ID only from trusted infrastructure after validation, never trust arbitrary header. Return safe correlation ID header and error metadata; no tracing service needed.

```ts
// illustrative, generated public service:
listPolicies(input: ListPoliciesInput, options?: RequestOptions): Promise<PaginatedResponse<Policy>>;
getProduct(input: GetProductInput, options?: RequestOptions): Promise<ApiResponse<Product>>;
deletePolicy(input: DeletePolicyInput, options?: RequestOptions): Promise<void>;
downloadPolicy(input: DownloadPolicyInput, options?: RequestOptions): Promise<BinaryResult>;
```

Input grouped by location (path/query/headers/body) where needed; no caller-supplied base URL, method, arbitrary headers, cache/security overrides or credentials. Query-only example may use flat page/pageSize convenience when collision-free; choose one consistent generated signature during implementation: propose grouped input for all endpoints, with examples elsewhere marked schematic. Auth through separate trusted app adapter. Distinguish omitted from explicit null. Required input validation and serialization always active, no automatic coercion of typed values; proxy HTTP wire parser explicitly converts declared primitives using strict grammar, rejects duplicates except documented array forms. Reject unknown path/query/body fields when contract closes them; open schema permits declared additionalProperties, never let arbitrary inputs influence route, auth or policy. Cookies are adapter-only; unsupported caller-supplied cookie params fail selected operation. Header allowlist excludes auth, cookie, host, forwarding and hop-by-hop headers. Encode individual path segments; reject path separators/dot segments and invalid encoding. Query parameters use declared style/explode: MVP scalar and form arrays (repeated or comma-separated with unambiguous encoding), path simple scalar, header simple scalar; deepObject, matrix, label, ambiguous object encoding and allowReserved forms that cannot be safely encoded reject. JSON body content-type application/json or declared +json, multipart FormData with explicit fields and bounds, never manually set boundary; binary request body bounded with declared media. No arbitrary request init or passthrough.

## Mapping and validation

MVP request mapping identity by default; allow explicit body projection from typed exposed fields via RFC6901 pointers only (no eval, loops or expressions). Propose request.mapping.body entries mapping upstream target pointer to exposed source pointer. Explicit exposed schema required if projection changes shape; all required upstream properties must be mapped, no overlapping/duplicate targets, no prototype keys, no undeclared outputs for closed schemas. Path/query/header identity by declared name/location; nonidentity parameter mapping deferred. Validate exposed input, project, validate upstream required input before send. Auth and tenant scope never sourced from body mapping. Unsupported mapping or ambiguous type fails build. Response mapping uses prior data/items/page/pageSize/totalCount pointers; validate source contract where required, project exactly declared fields, validate exposed result; absent data pointer means full declared public JSON body. Mandatory server field protection requires explicit allowlisted projection or upstream verified access; do not silently treat client projection as security. Never leak excluded fields through errors, metadata or hydration.

strict response validation fails with INVALID_RESPONSE; warn emits redacted diagnostic and may return unvalidated typed value (explicit unsafe opt-in for nonsecurity endpoints, documented); off skips optional response validation only. Mandatory input, media/size, required mapping, security and policy checks never disabled. Proxy mandatory exposure validation cannot be warn/off. For strict validation, no silent Zod coercion/defaults/stripping; exact additionalProperties semantics. Optional validation modes still enforce safe parsing and projection. JSON response must have expected content type, bounded bytes and valid JSON; empty successful 204/HEAD returns void (no json call). Explicit empty response may cover declared no-body 2xx; unexpected body/status errors. Binary success uses bounded buffering, validated media allowlist, safe filename sanitization, no executable HTML/SVG served inline by proxy, attachment and nosniff for downloads. No automatic binary hydration/persistence. Streaming and range forwarding deferred. Multiple media/status choices require explicit selection in endpoint config or representable union; no silent assumption that all 2xx map identically. Exact status > range > default for matching; undeclared unexpected success is invalid response.

Pagination public one-based page; pageSize positive safe integer; totalCount nonnegative safe integer. Upstream zero-based must explicitly declare indexBase:0 (normalize request page-1 and response page+1, identity otherwise; no guessing). totalPages = ceil(totalCount/pageSize), zero for empty result. hasNextPage = page < totalPages, hasPreviousPage = page > 1 AND totalPages > 0. Empty/out-of-range pages may have empty data; verify page and size correspond to requested contract and item count <= pageSize; inconsistent totals/fields produce invalid response. No fabricated count or cursor conversion. Cursor pagination deferred; preserve source metadata, reject selected cursor-only pagination unless modeled as ordinary data. Infinite query support can use explicit page-based next page with initialPageParam 1, getNextPageParam returns next only when hasNextPage; separate key namespace for infinite vs finite. No loop without configured bound; optional maxPages limit in consuming query config.

## Cancellation, timeout, retry

Default total transport deadline 15000ms, retries 0; hard caps set by policy. Compose caller, incoming proxy disconnect (where platform supports signal) and deadline with AbortSignal; cover fetch AND bounded body read and backoff. Clean timers/listeners, distinguish caller cancellation from timeout and network errors; cancellation never retried. Upstream server may have already performed mutation; no rollback promise. Proxy receives its own bounded deadline; aborts upstream on disconnect best-effort. End-to-end budget may be shorter than nested local deadlines. Default redirect error for server; direct browser redirect policy restricted to approved behavior and upstream contract, no cross-origin secrets. Network failures, HTTP non-2xx and invalid JSON are distinct. Retry opt-in only for GET/HEAD and approved transient network failures, 408/429/502/503/504; max attempts and elapsed deadline bounded, exponential jitter, honor valid bounded Retry-After, no retry on cancellation, validation, 401/403/404 or unknown policy. Mutation retries disabled in MVP; future only with proven idempotency/replay safety, not based on HTTP method alone. Avoid duplicate retry layers: generated TanStack options retry:false, transport owns configured upstream retries; proxy client does not retry proxy when server transport owns retries. Direct services own retries when enabled. Limit attempts per actual request, not promise global exactly once. Auth refresh/session lifecycle deferred, no implicit refresh loop.

## Query and cache

TanStack Query v5 peer dependency when used. Generate service, query key factory, queryOptions, useQuery hook; mutationOptions/useMutation hook; page infinite variants when explicit. Stable key tuple ["frontspan", projectNamespace, cacheScope, endpointId, "finite"|"infinite", canonicalInput] (prefix through endpoint ID for invalidation). cacheScope is nonsecret opaque app session/tenant scope, never token; canonicalInput includes every data-affecting nonsecret parameter, explicit absence and JSON-safe values, deterministic arrays/objects, never headers with credentials or confidential fields. Sensitive inputs unsuitable for cache keys require explicit nonsecret stable surrogate proven safe, or query.kind:none/service only. No hash-of-secret as security substitute. Binary/empty mutations not auto-persisted, binary queries service-only MVP. Do not reuse finite/infinite keys. Default staleTime 0, gcTime 5min browser, retry:false, no persistence/broadcast, no server data cache. TanStack client cache is distinct from disabled server/CDN cache; app owns provider and user lifecycle. Use fresh QueryClient per SSR request and per browser auth scope; on logout/tenant switch cancel pending queries, discard old client/cache and prevent late completions from populating new scope. SSR prefetch with server-only executor using same logical key and safe scope as hydrated client; dehydrate only successful explicitly hydration-safe JSON results with framework escaping; no credentials, raw errors, private unapproved payloads or binary. If endpoint not safe to serialize, fetch client-only or server render without hydration as approved. Do not use process-wide QueryClient or static Next data caches for user data. Nonzero staleTime may be configured for prefetch UX within policy.

Mutation invalidation explicitly configured endpoint IDs plus scope prefix or exact canonical input mapping; only within current namespace/auth scope after success. Never infer from paths/tags; no global invalidation by default, no optimistic writes by default. Exact mapping limited to explicit validated nonsecret input pointers. If exact target mapping unavailable fail configuration, or choose prefix explicitly. User-supplied query options cannot override generated query key/function or required security behavior; consumer can adjust permitted observer options. App owns retry override outside toolkit, not guaranteed by policy if bypasses runtime; enterprise gate addresses trusted usage.

## References and verification

Reviewed 2026-11-28:
- https://tanstack.com/query/latest/docs/framework/react/guides/query-retries
- https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- https://nextjs.org/docs/app/api-reference/functions/fetch

Planned tests: 204/HEAD, binary/multipart size and media, JSON invalid/unexpected status, mapping/required fields, null vs omitted, strict/warn/off and mandatory protection, page base/empty/out-of-range, cancellation during body/backoff, total deadline, no duplicate retries, no mutation retry, typed errors/redaction, stable finite/infinite keys, scope change and late result, per-request SSR and safe hydration, exact/prefix invalidation, direct/proxy identical exposed signatures. Exact schema additions and generated signatures require implementation consistency checks. No tests executed.
