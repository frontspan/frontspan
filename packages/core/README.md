# Core configuration foundation

`@frontspan/core` is private and unpublished. The root entry point contains only TypeScript contracts. Use the Node-only `@frontspan/core/config` entry point to load authored configuration from an explicit project root:

```ts
import { loadConfig } from "@frontspan/core/config";

const result = await loadConfig("/path/to/project");
if (result.ok) {
  // Authored, immutable documents with project-relative paths; not runtime policy.
  const { root, resources, endpoints, environments } = result.config;
} else {
  const [diagnostic] = result.diagnostics;
}
```

Draft 2020-12 schemas ship as `@frontspan/core/schemas/{root,resource,endpoint,environment}.schema.json`. The loader checks only its bundled schema vocabulary, not arbitrary JSON Schemas. `$schema` in authored JSON is an IDE hint; the loader never follows it. Schema validation is followed by layout, module, reference, and route checks. IDs come from document content, not filenames. Documents are returned in locale-independent path order. On failure, the loader returns a single deterministic error with a stable code, document kind, an optional zero-based index in that kind's sorted file list, and a safe JSON pointer. Diagnostics do not quote authored values or machine paths.

The authored loader never resolves or reads environment values, imports contracts, evaluates policy, creates routes, or changes files. A missing source contract can still have a valid configured path; existence and content belong to the import step. The loader validates URL syntax and rejects credential-bearing literals; it does not verify public environment reference approval, destination authorization, or other effective policy. Configuration may itself contain private destination references and is not safe to expose to browsers. Preset resolution, profile selection and policy merge belong to #23; editing and revision coordination belong to #24. Fields without a concrete approved authored shape (such as import credential headers, contract-ref roots, cache, request projection and invalidation) are rejected until specified. They are not silently ignored.

The read limits are 256 KiB per JSON document, 8 MiB total, 64 nested JSON containers, and 1,024 enumerated directory entries. The loader confines canonical project-relative inputs to the supplied root, rejects symbolic links beneath it, and checks regular file identity and metadata around reads. It is not a filesystem sandbox or a coherent multi-file snapshot against concurrent hostile local writers. Treat the explicit project root and its filesystem as local trust boundaries.

See [Configuration v1](../../docs/specifications/CONFIGURATION-V1.md) for the accepted design and follow-up contracts.
