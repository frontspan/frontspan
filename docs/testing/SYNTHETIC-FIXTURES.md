# Synthetic fixture inventory and verification matrix

Status: Sprint 0 design, not executable fixtures or test results. Issue #8 (D-12), 2026-11-28. Based on accepted ADR-015–018, [OpenAPI research](../research/OPENAPI-CODEGEN.md), [release scope](../product/SCOPE.md), [configuration](../specifications/CONFIGURATION-V1.md), [IR](../specifications/IR-V1.md), [codegen](../specifications/CODEGEN-V1.md), and [sync](../specifications/SYNC-V1.md). Runtime and Studio test expectations that depend on PR #17 and #18 are provisional until those proposals are approved; this inventory does not authorize or supersede them.

## Synthetic domain

Use an invented order/catalog system, independent of any actual company. All IDs, names, values and auth contexts are fabricated. No copied production schemas, URLs, error payloads, tokens or business rules; anonymization alone is not authorization. Use reserved example.invalid for nonexecuted contract server metadata. Network tests run against isolated synthetic harness destinations only, with explicit fixture-only allowlist, no external internet calls, and no production policy exceptions. Use two synthetic identities user-a/tenant-a and user-b/tenant-b, with distinct records and fake credentials generated for each run. No actual credentials committed. Direct product catalog is public; orders and documents require authenticated authorized caller. No database service required: deterministic in-memory test server reset between scenarios.

| Fixture endpoint | Selected mode and expected success | Purpose |
|---|---|---|
| GET /products | direct; ApiResponse<Product[]> | Incremental install, query and public base URL |
| GET /products/{id} | direct; ApiResponse<Product> | Path encoding, 404, schema refs |
| GET /orders?page=1&pageSize=2 | proxy; paginated Order[] | Wrapped upstream data projection, auth, pagination |
| GET /orders/{id} | proxy; ApiResponse<Order> | Tenant/record authorization, server-side exposed fields |
| POST /orders | proxy; ApiResponse<Order> | Required request validation, mutation and explicit invalidation |
| PATCH /orders/{id} | proxy; ApiResponse<Order> | Optional vs nullable fields, typed body mapping if approved |
| DELETE /orders/{id} | proxy; void | Declared 204, no JSON parse, invalidation |
| GET /orders/{id}/invoice | proxy; binary | Media/size checks, safe filename, no hydration |
| POST /documents | proxy; ApiResponse<Document> | Multipart fields/bounds, auth |
| GET /categories | direct; ApiResponse<Category[]> | Recursive graph and validators |
| GET /internal/unselected | not selected | Import catalog only; no generated service or proxy exposure |

Example conceptual types: Product {id: string, name: string, priceMinor: integer}; Order {id: string, product: ProductSummary, quantity: integer, status: pending|confirmed, note?: string|null}; Category {id: string, children?: Category[]}. Deliberately include shared ProductSummary in catalog and orders, mutually recursive synthetic schemas in parser-only cases, readOnly id and writeOnly test field in directional schema cases. Use schema constraints that fit approved feature subset. Example order list source result has items [order-a1, order-a2], page 1, pageSize 2, total 3; projected public data length 2, totalPages 2, next true, previous false (pagination details conditional on #17). Tenant B records never appear in tenant A output. Fixture responses include controlled errors, malformed media/body, latency and disconnects. Reset deterministic state per test; use injected clocks/randomness where appropriate, not real sleep for unit tests.

## Proposed fixture paths (not created in Sprint 0)

    fixtures/
      contracts/
        catalog/3.0.yaml
        catalog/3.1.json
        orders/2.0.json
        orders/3.0.yaml
        orders/3.1.json
        orders/evolution/{baseline,compatible,breaking,review,invalid}.json
        edge-cases/
      projects/
        existing-next/
        fresh-template/
        ownership-conflicts/
      upstream/
      expected/
        ir/
        diagnostics/
        generation/
        sync/
      scenarios/

Repository layout here is a planning recommendation; implementation tasks own actual paths. Use equivalent semantic subsets across dialects rather than assume full 2.0/3.1 equivalence. Fixture manifests declare source versions, selected IDs, expected diagnostic codes, normalized semantic assertions, artifact paths, classification and test stage. Goldens reviewed alongside code; update explicitly, never blindly regenerate expected outputs to pass failures. Synthetic fixtures contain no active external links or executable vendor extensions. Security vectors are isolated local negative tests.

## Traceable test inventory

| ID | Test group | Expected outcome | Target sprint / requirements |
|---|---|---|---|
| CFG-01 | Strict JSON, required fields, duplicate IDs, unknown schema version, missing resource | Invalid input rejected with stable diagnostics, no writes | 1 / FR-06,09 |
| CFG-02 | Preset precedence, array replacement, restricted env override and mandatory cap | Correct effective config; weakened policy fails | 1 / FR-09 |
| CFG-03 | Secret references, direct eligibility, path traversal/symlink | No resolved secret in config/IR; forbidden paths rejected | 1 / FR-06,09 |
| CFG-04 | Explicit migration preview, stale revision | No silent migration; stale plan rejected | 1 / FR-06 |
| INS-01 | Existing Next install and new empty project plan | No unrelated file rewrites; explicit conflicts and package-manager plan | 1 / FR-01 |
| OAS-01 | Equivalent supported Swagger 2.0, OAS 3.0/3.1 JSON/YAML | Same contract meaning where equivalent; preserve original version | 2 / FR-02 |
| OAS-02 | Swagger formData arrays, binary and nullable conversion | Preserve semantics or explicit diagnostic | 2 / FR-02 |
| OAS-03 | Missing refs, JSON pointer escapes, same schema names across resources | Stable IDs; missing selected refs fail | 2 / FR-02 |
| OAS-04 | Recursive/mutually recursive graph, selected transitive closure | Finite graph, required refs only, no unselected operation exposure | 2 / FR-02 |
| OAS-05 | Remote ref, local root escape, symlink, transitive ref | Denied by default; approved local refs only; no unauthorized IO | 2 / FR-02,09 |
| OAS-06 | allOf/anyOf/oneOf, discriminator, additionalProperties, read/write direction | Faithful supported semantics or fail closed | 2/3 / FR-02,03 |
| OAS-07 | Multiple status/media, inherited params/security, duplicate/missing operationId | Preserve metadata; reject ambiguous selected operation | 2 / FR-02 |
| OAS-08 | Unsupported 3.1 keyword/dialect, 3.2, invalid/oversized input, YAML alias expansion | Bounded explicit failure; no silent downgrade | 2 / FR-02 |
| GEN-01 | Repeat generation and semantically unordered key changes | Byte-identical output and lock; no timestamps/local paths | 3 / FR-03 |
| GEN-02 | Shared schema, recursive references, name/path collisions, hostile descriptions | Compiling valid output or diagnostic before writes; no injection | 3 / FR-03 |
| GEN-03 | Consumer Next fixture: service, query keys/options/hooks, Zod | Public imports compile across approved target matrix; conditional on #17 | 3 / FR-03,05 |
| OWN-01 | Unknown colliding files, dirty/missing owned file, stale lock, safe deletion | Conflict; never overwrite manual files; delete only verified obsolete owned files | 3/4 / FR-04 |
| SYN-01 | Compatible, breaking, review-required and invalid evolution | Expected classifications and impacted endpoint/artifact IDs | 4 / FR-04 |
| SYN-02 | Preview, stale approval, opted-in compatible apply, offline CI check | Read-only preview/check; stale/invalid/conflicting apply blocked | 4 / FR-04 |
| SYN-03 | Interrupted transaction and concurrent edit | Recover or preserve conflicts; no loss of unrelated bytes | 4 / FR-04 |
| UI-01 | CLI/Studio identical input, edit/watch conflict, packaged local server | Same plan/diagnostics; no silent overwrite; conditional on #18 | 5 / FR-06 |
| UI-02 | Host/origin/pairing, path restriction, untrusted documentation | Reject unauthorized local access; conditional on #18 | 5 / FR-06 |
| UI-03 | Playground allowed endpoint, redaction, denied mutation/destination | Explicit permitted calls only; conditional on #17/#18 | 5/6 / FR-07 |
| HTTP-01 | JSON mapping, strict schema, 204, binary/multipart, invalid media | Correct normalized values or bounded errors; conditional on #17 | 3/6 / FR-05 |
| HTTP-02 | Cancellation, timeout/body read, retry budget, mutation no retry | No duplicate retry layers; conditional on #17 | 3/6 / FR-05 |
| QUERY-01 | Pagination, explicit invalidation, scoped keys, SSR hydration | Correct results; no cross-user cache; conditional on #17 | 3/6 / FR-03,05 |
| PROXY-01 | Missing/denied auth, wrong tenant, forwarded headers and exposed fields | Denied before upstream IO when applicable; no privilege escalation/leak | 6 / FR-08 |
| PROXY-02 | SSRF destination, DNS rebinding/redirect, traversal, CSRF, oversized input | Block unsafe requests; requires approved #17 and security verification | 6 / FR-08,09 |
| GOV-01 | Tampered preset/lock/CI policy, weakened env and deployed policy | Protected expected policy and runtime checks fail closed; requires #17 | 1/6 / FR-09 |
| PILOT-01 | Incremental consuming app, manual/generated parity and evolution | Evidence for all release gates, not just build success | 6 / FR-01–09 |

Sprint references are logical targets from roadmap, not dates. Security checks must run before pilot deployment regardless of sprint. Use unit tests for deterministic logic, integration tests for fixture IO/HTTP and packaged consumers, Playwright for local Studio workflow, production Next build for runtime isolation. Run approved contributor/consumer matrix and record exact versions; no certification from a single test pass.

## Evolution cases

Baseline selected orders.list/detail/create, shared ProductSummary. Candidate A adds unselected search endpoint and optional request filter without changing existing semantics: compatible where old accepted inputs remain valid. Candidate B removes required response field or expands response enum: breaking; impacted selected operations and artifacts reported. Candidate C changes auth requirement or mapping pointer with valid but uncertain semantic behavior: review-required. Candidate D missing selected ref or invalid mapping: invalid and cannot approve. Additional cases cover strict additionalProperties, required input, public import relocation, manually modified artifact and stale approval. No remote fetch in normal CI; fixture inputs pinned.

## Test evidence

Each result records fixture ID, commit, tool versions, exact command, outcome, expected/actual and redacted failure summary. Failed or skipped mandatory case blocks corresponding release gate. No flaky retry to hide failures; investigate deterministic reproduction. No real customer data in fixtures, CI logs or evidence. All cases above are planned, none executed in Sprint 0.