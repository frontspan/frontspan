# Normalized contract IR v1 — proposed

Status: proposed for S0-04 (#4), not executable code. ADR-016 governs. Core owns neutral contracts; openapi owns adapters/import; codegen, next and Studio consume public contracts. No Scalar/TypeScript compiler objects, runtime secrets, functions, Map, Set or cyclic JS objects in serialized IR. Graph cycles use string IDs. No parser-specific schema types in public API.

## Contract boundaries

SourceContract describes the upstream API as documented (operation and schema graph, serialization, media and security metadata). ExposedContract is the application-facing endpoint contract after selection, mapping and execution choice. They are linked by IDs, never by mutating source types. Configuration is authored intent; IR is derived, never hand-edited. Runtime consumes validated endpoint registry/projection, not raw spec or full codegen engine. Graph includes only selected operations and transitive closure for generation; full imported graph can support Studio catalog. Future composite or collection providers can emit the same exposed model without inventing OpenAPI input. v1 source kind is openapi.

## Type sketches (normative shape proposal, not implementation)

```ts
type Id = string;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
type Pointer = string;
type SchemaId = Id;
type ValueRef = { kind: "literal"; value: string } | { kind: "env"; name: string };
interface Origin {
  resourceId: Id;
  documentId: Id; // opaque stable identity, not a raw credentialed URL
  pointer: Pointer;
  sourceVersion: string;
}
interface ContractIR {
  irVersion: 1;
  sources: Record<Id, SourceContract>;
  schemas: Record<SchemaId, SchemaNode>;
  endpoints: Record<Id, ExposedContract>;
}
interface SourceContract {
  id: Id; resourceId: Id; kind: "openapi";
  version: "2.0" | `3.0.${number}` | `3.1.${number}`;
  documentDigest: string;
  operations: Record<Id, SourceOperation>;
  securitySchemes: Record<Id, SecurityScheme>;
}
interface SourceOperation {
  id: Id; method: HttpMethod; path: string; operationId?: string;
  tags: string[]; deprecated?: boolean; origin: Origin;
  parameters: Parameter[];
  request?: { required: boolean; media: Media[] };
  responses: Response[];
  security: SecurityAlternative[];
}
interface Parameter {
  name: string; in: "path" | "query" | "header" | "cookie";
  required: boolean; schema: SchemaId;
  style: string; explode: boolean; allowReserved: boolean;
  origin: Origin;
}
interface Media {
  contentType: string; schema?: SchemaId;
  encoding?: Record<string, { contentType?: string; style?: string; explode?: boolean }>;
}
interface Response {
  status: string; // exact status, allowed range, or default
  media: Media[]; // empty array = no declared body
  headers: Record<string, SchemaId>;
}
type SecurityScheme =
  | { kind: "http"; scheme: string; bearerFormat?: string }
  | { kind: "apiKey"; in: "header" | "query" | "cookie"; name: string }
  | { kind: "oauth2" | "openIdConnect" | "mutualTLS"; metadata: Json };
type SecurityAlternative = Record<Id, string[]>; // AND within, OR across; empty object = anonymous
interface ExposedContract {
  id: Id; domain: string; name: string;
  source: { resourceId: Id; operationId: Id };
  execution:
    | { mode: "direct" }
    | { mode: "proxy"; method: HttpMethod; path: string };
  parameters: Parameter[];
  request?: { required: boolean; media: Media[] };
  success: Response[];
  errors: Response[];
  responseKind: "data" | "paginated" | "empty" | "binary";
  responseMapping?: Record<string, Pointer>;
  query: { kind: "query" | "mutation" | "none"; invalidates?: Id[] };
  policyRef: Id; // effective validated runtime policy, no resolved values
}
type Primitive = "string" | "number" | "integer" | "boolean" | "null";
interface SchemaNode {
  id: SchemaId; origin: Origin; title?: string; description?: string;
  // Adjacent schema keywords combine as constraints, not mutually exclusive variants.
  booleanSchema?: boolean;
  ref?: SchemaId;
  types?: Array<Primitive | "array" | "object">;
  enum?: Json[]; const?: Json;
  properties?: Record<string, SchemaId>; required?: string[];
  additionalProperties?: boolean | SchemaId;
  items?: SchemaId; prefixItems?: SchemaId[];
  allOf?: SchemaId[]; anyOf?: SchemaId[]; oneOf?: SchemaId[];
  discriminator?: { property: string; mapping: Record<string, SchemaId> };
  readOnly?: boolean; writeOnly?: boolean;
  format?: string; constraints?: {
    minLength?: number; maxLength?: number; pattern?: string;
    minimum?: number; maximum?: number;
    exclusiveMinimum?: number; exclusiveMaximum?: number; multipleOf?: number;
    minItems?: number; maxItems?: number; uniqueItems?: boolean;
    minProperties?: number; maxProperties?: number;
  };
  unsupported?: string[]; // diagnostic keyword pointers; never silently dropped
}
interface Diagnostic {
  code: string; severity: "error" | "warning" | "info";
  phase: "config" | "load" | "parse" | "resolve" | "normalize" | "select" | "project" | "generate";
  message: string; origin?: Origin; endpointId?: Id; schemaId?: SchemaId;
}
```

Types above specify the initial boundary, not a promise that every field or keyword is generatable. Runtime policy and transport response wrapper types are specified in S0-06. policyRef resolves in validated registry, not arbitrary file path. request/response schemas can be distinct directional derived nodes. Exposed success/errors must describe the normalized public result rather than raw upstream; empty and binary bypass JSON wrappers. Mapping pointers checked against source schema; ambiguous union branches require explicit compatible projection or fail. Errors use normalized contract in S0-06; don't assume all upstream codes become success.

## Identity, provenance and canonicalization

Operation identity = resourceId + exact uppercase method + exact original path template, encoded unambiguously (canonical JSON tuple or escaped fields, no delimiter collisions). Preserve operationId as annotation; missing/duplicate operationId does not alter source identity, but duplicate generated names require explicit resolution. Endpoint ID is stable authored ID independent of source operationId. Resource rename or method/path rename is remove/add unless explicit reviewed migration. Schema IDs are resource-qualified document identity + canonical RFC 6901 pointer (decode ~0/~1 correctly); inline nodes use their own pointer, not unstable traversal counter. Approved external document identity derived from configured root-relative location, never absolute workstation path. Derived directional/projection schemas use deterministic qualified IDs with direction/purpose. No silent dedup by shape across different resources.

Canonical serialization sorts map keys with a locale-independent comparator; unordered sets (required, tags where used as set) normalized; preserve order of semantically ordered arrays (tuple positions, precedence, meaningful mapping/config arrays). Do not blindly sort all arrays or normalize case-sensitive HTTP paths. Canonical JSON encoding with finite numbers and UTF-8; reject duplicate keys, NaN/Infinity, unsupported dialects; hash SHA-256 of canonical bytes for semantic snapshots, separate raw byte digest for provenance. Exclude machine-local paths, timestamps and secret values from reproducible output. Exact hash/lock contract and breaking-change semantics in S0-05. Documentation changes may affect emitted comments, not necessarily compatibility classification.

## Reference and schema semantics

Build bounded graph of referenced nodes; resolve each document/pointer through controlled loader, never implicit network. Mark in-progress nodes and use edges for recursion; SCC traversal handles mutually recursive schemas without stack explosion. Validate missing refs, duplicate identities, reference target types, pointer escaping and graph limits. Determine closure from selected operations' params, bodies, responses, headers and referenced schema nodes; include all composition/discriminator edges. Distinguish schema references (cycles allowed) from cycles in non-schema reference chains (reject when unresolved). No full dereference. For 3.0 Reference Objects, prohibited sibling constraints fail explicitly rather than treating them as 3.1 schema semantics. For 3.1 schema $ref adjacent keywords apply together; preserve and verify their semantics. External schema dialect fetching prohibited. Resolve all required references before generation. Structural errors and security violations always fail; unsupported unused features can be catalog diagnostics, selected closure errors block output.

| Construct | MVP policy (target; fixture verification required) |
|---|---|
| Primitive/object/array, required, enum, const, null unions | Support; absent vs null distinct; no coercion by default |
| Swagger 2.0 nullable extension and 3.0 nullable | Recognized explicitly only where semantics well-defined; otherwise diagnostic |
| boolean schema true/false | Preserve unconstrained vs impossible; true maps to unknown, not any |
| additionalProperties absent/true/false/schema | Preserve semantics; no silent strict-object conversion |
| allOf | Intersection semantics; incompatible/complex shapes fail if not faithfully representable |
| anyOf | Union; runtime matches at least one |
| oneOf | Exactly one at runtime, not ordinary union validator; unsupported overlap/validator cases fail |
| discriminator | Preserve mapping; validate referenced branches; not independent replacement for validation |
| readOnly/writeOnly | Direction-specific request/response constraints, requiredness evaluated by direction |
| numeric/string/array constraints and known formats | Preserve; implement verified subset; unknown format annotation unless declared assertion; unsupported assertions fail selected validation |
| recursive named schemas | Preserve graph; generated lazy validator/types require fixture; unsupported recursion fails |
| tuple prefixItems, conditional/not, unevaluatedProperties, patternProperties, dynamic refs/custom dialect | Deferred; selected unsupported constructs error, not erased |
| JSON content, multipart, binary and no body | Preserve all declared media; explicit choice or fail ambiguity; implementation gated by S0-06 |
| Path/query/header/cookie parameters | Preserve location, inherited overrides, requiredness and serialization; unsupported style/encoding fails selected operation |
| status exact/range/default, response headers | Preserve; exact beats range beats default; exposed success/error mapping separately reviewed |
| security alternatives | Preserve metadata; absent operation security inherits root; empty array means no requirements; anonymous alternative distinct; never automatically enforce or grant credentials |
| callbacks/webhooks/streaming/TRACE and 3.2 | Not generated in MVP; clear diagnostic (3.2 document rejected) |

Do not claim TypeScript expresses every validation constraint; static types can be wider than runtime validators, documented as such. Mandatory runtime schema checks must fail closed when feature unsupported. No automatic speculative fallback to any or empty schema. Optional validation off does not permit unsupported transport serialization/security.

## Example: list projection

Source policies GET /policies has 200 application/json with object result.items: Policy[], result.page: integer, result.pageSize: integer, result.total: integer. Auth requirements reference upstream bearer scheme as metadata. Endpoint policies.list proxy GET /api/frontspan/policies selects it and projects those four fields into exposed paginated data and pagination model. Source schema remains unchanged; generated client uses exposed Policy[] and normalized metadata, not raw result wrapper. Derived fields and page-base conventions are S0-06. Direct catalog.detail maps /payload to public data on client only; backend retains all security authority. No private fields may be delivered and then hidden as security.

## Diagnostics and verification

Stable codes e.g. CFG_DUPLICATE_ID, CFG_POLICY_VIOLATION, CFG_UNKNOWN_VERSION, OAS_UNSUPPORTED_VERSION, REF_FORBIDDEN, REF_UNRESOLVED, IR_UNSUPPORTED_KEYWORD, IR_ROUTE_COLLISION, IR_MAPPING_INVALID, IR_NAME_COLLISION. Sort diagnostics deterministically by phase/resource/pointer/code; redact URLs/headers and never include resolved credentials or full sensitive payload. Errors block apply, warnings visible in CLI/Studio; no output modification on invalid selected closure. Limit document bytes, alias expansion, graph nodes/depth and diagnostics; choose measurable caps in parser spike. Build source IR, validate graph and selection, project exposed contract, validate projection then emit. Tests in S0-08 must cover ADR-016 fixture matrix, mapping and stable identities; no fixture execution or certified support yet.