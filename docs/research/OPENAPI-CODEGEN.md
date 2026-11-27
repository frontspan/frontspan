# OpenAPI and code generation research — S0-03

Date: 2026-11-27. Issue #3. Scope: inspected selected source files at pinned revisions; not full audits or executed benchmarks. No implementation, dependency installation or copied source.

## Pinned sources

Orval: 0f2be5d2525191e9379aab6f0aa6026beae3f8e4 (package manifest 8.49.0; not a claim about published release).
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/src/import-specs.ts — lines 1–185: source loading, reference scan, allowlist before external resolution, transitive enforcement described, fast path for internal pointers, transform and validate, upgrade with explicit form-data and binary preservation.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/src/import-open-api.ts — inspected filtering and API builder invocation; gathers transitive components for selected operations.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/src/api.ts — first 125 lines: operation traversal, path-item refs, name reservation and generator options.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/core/src/resolvers/dereference/dereference.ts — specific schema expansion helper documents fallback to empty schemas for cycles/unresolved refs and caching; not evidence all Orval generation handles cycles this way.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/src/generate-spec.ts — first 175 lines: import before cleaning, check-only path, owned directories versus mixed mock directories. 
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/src/write-specs.ts — first 190 lines: output-mode writer imports, formatting and optional Zod writer.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/packages/orval/package.json — Scalar parser and json-magic dependencies; modular generators.
- https://github.com/orval-labs/orval/blob/0f2be5d2525191e9379aab6f0aa6026beae3f8e4/LICENSE — MIT.

Hey API: d6ba11fd9ae4f2b707454940121056fdb505235c. Original hey-api/openapi-ts redirects to hey-api/hey-api.
- https://github.com/hey-api/hey-api/blob/d6ba11fd9ae4f2b707454940121056fdb505235c/packages/shared/src/openApi/3.1.x/parser/index.ts — first 150 lines: optional validation, dependency graph filtering, transforms, components, security and operation parsing. Tree lists separate 2.0/3.0/3.1 parser directories; contents of all versions not audited.
- https://github.com/hey-api/hey-api/blob/d6ba11fd9ae4f2b707454940121056fdb505235c/packages/shared/src/ir/types.ts — first 150 lines: distinct normalized operation, parameter, response and schema types. Not all media types/headers covered by shown IR.
- https://github.com/hey-api/hey-api/blob/d6ba11fd9ae4f2b707454940121056fdb505235c/packages/openapi-ts/src/generate/output.ts — plugin execution, project planning, intent processing and rendering/writing; optional cleaning recursively removes output directory. Do not assume dry-run or cleaning semantics safe without testing.
- https://github.com/hey-api/hey-api/blob/d6ba11fd9ae4f2b707454940121056fdb505235c/packages/openapi-ts/src/generate/client.ts — first 150 lines: client bundle copying and environment-specific path resolution.
- https://github.com/hey-api/hey-api/blob/d6ba11fd9ae4f2b707454940121056fdb505235c/LICENSE — MIT.

## Findings and implications

Orval stays close to the OpenAPI document in the inspected import/API builder path while constructing generator-specific models. Its preflight and selection approach is useful: do not mutate output before successful parsing; collect transitive dependencies. Upgrade caveats (form-data arrays, nullable refs, binary data) show why conversions need fixture tests rather than assumed equivalence.

Hey API separates normalized IR and generation planning. This fits Frontspan's need to represent upstream and exposed contracts independently and later incorporate composite endpoints. Its symbol/planning approach motivates explicit naming and import planning. Avoid adopting either generator wholesale; retain Frontspan-owned contract semantics and shared runtime. Neither observed output cleaning pattern is our intended ownership protocol.

Both pinned root licenses are MIT; if code is ever reused, retain required notices and review file/dependency-specific licenses. This research recommends independent implementation, not copying.

## Parser evaluation (documentation review)

- Scalar parser: https://github.com/scalar/scalar/blob/main/packages/openapi-parser/README.md — advertises 2.0/3.0/3.1/3.2 parsing/validation and upgrade. Prefer as candidate behind adapter; Orval uses it. Validate exact version, license, no uncontrolled reference IO, conversion semantics and resource usage in spike.
- Swagger Parser: https://apidevtools.com/swagger-parser/options.html — documented 2.0/3.0 schema validation; useful alternative but not selected for 3.1 baseline.
- JSON Schema Ref Parser: https://apidevtools.com/json-schema-ref-parser/docs/options.html — configurable ref resolving/cycles, not sufficient alone for OAS version validation.
- Official specs: https://spec.openapis.org/oas/ and https://learn.openapis.org/upgrading/v3.0-to-v3.1.html — distinguish OAS document validation from schema dialect validation. 3.1 uses JSON Schema 2020-12-based vocabulary; 3.2 features require separate compatibility work.

## Proposed synthetic fixture matrix (not executed)

| Fixture | Expected behavior |
|---|---|
| Swagger 2.0 definitions, host/basePath, body and formData array | Normalize equivalent operations; preserve array and serialization semantics or report unsupported |
| OAS 3.0 nullable and 3.1 null union | Same normalized meaning when equivalent; distinguish optional from nullable |
| JSON and YAML equivalent specs | Identical normalized semantics/output; duplicate keys/invalid YAML rejected |
| Recursive and mutually recursive schema refs | Finite graph; preserve named edges; types and lazy validators when supported |
| Missing ref, escaped JSON pointer tokens, repeated names across documents | Explicit diagnostic; correct pointer decoding and stable qualified IDs |
| External file outside root, symlink escape, remote ref, redirect, nested external ref | Block by default; no unauthorized IO |
| Explicit local file ref within approved root | Resolve only through controlled loader; enforce graph and byte limits |
| allOf/oneOf/anyOf/discriminator, additionalProperties, readOnly/writeOnly | Preserve directional semantics; diagnose unsupported or nonrepresentable constraints rather than silently weaken |
| Multiple response codes/media types, 204, binary and multipart | Distinct contracts and explicit selection; never assume JSON |
| Path/query/header/cookie params, inherited overrides, style/explode | Preserve requiredness and serialization; unsupported forms fail selected operation |
| Multiple security alternatives, anonymous override, inherited scheme | Retain requirements as metadata; no invented credentials or auth implementation |
| Tag/operation filtering with transitive refs | Include closure; deterministic domain placement |
| Duplicate operationId, missing operationId, hostile names and descriptions | Stable fallback identity for missing IDs; collision diagnostic/explicit override; safe escaped output |
| Reordered object keys, unchanged inputs, removed operation | Stable plan/output; obsolete artifacts identified without touching manual files |
| OAS 3.1 unsupported schema keyword or dialect; OAS 3.2 input | Explicit diagnostic, no silent downgrade; 3.2 rejected in MVP |
| Invalid input, oversized documents, YAML alias explosion | Bounded failure; no writes on failure |

No performance results or compatibility certification. S0-04 owns detailed configuration/IR contracts; S0-05 owns output ownership and sync algorithm; S0-08 will define fixture files.
