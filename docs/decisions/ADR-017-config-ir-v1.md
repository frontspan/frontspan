# ADR-017 — Configuration and normalized IR v1

Status: Accepted by maintainer on 2026-11-28; implementation and verification pending. Date: 2026-11-27. Issue #4; D-03/D-05.
Read [Configuration v1](../specifications/CONFIGURATION-V1.md) and [IR v1](../specifications/IR-V1.md) as the accepted design baseline.

## Accepted decisions

- Modular strict JSON, local Draft 2020-12 schemas and semantic validation; version each document and migrate explicitly. Shared loader/editor for CLI and Studio.
- Stable IDs, explicit selection materialized into endpoint files; no implicit endpoint exposure. Git-tracked authoring and separately derived effective config.
- Exact declarative preset pins, explicit precedence and restricted environment overrides. Hard constraints accumulate restrictively; violations error, no silent fallback.
- Reference-only server secrets and separate public URL settings for direct mode. No browser/server leakage. Preset alone cannot enforce trust; S0-06 supplies enforcement design.
- Own neutral JSON-serializable source and exposed contract IR v1, graph refs with stable resource/document/pointer IDs, direction-specific schemas and fail-closed unsupported features.
- Preserve OpenAPI semantics and original provenance; bounded parsing and reference loading; explicit supported feature targets and diagnostics.
- Response projection uses limited JSON pointers, not arbitrary code. Detailed request mapping, transport wrapper/pagination/error/cache contract and policy registry follow S0-06. Ownership/lock, snapshot policy details and deterministic writer follow S0-05. Studio concurrency follows S0-07.

## Alternatives

One giant config complicates edits; executable TS config weakens Studio roundtrip and introduces evaluation. Wildcard selection can silently expose newly imported operations. Unrestricted deep merge risks policy downgrade; restrictive field-specific merge avoids ambiguity. Reusing OpenAPI as public model cannot represent independent exposed contracts. Full dereference loses identity/cycles. Arbitrary JSON Schema support cannot be claimed without faithful transport and validator behavior.

## Remaining work and gates

No code, schema package, tests or dependencies. Maintainer approval recorded; implement and verify in the relevant sprints. Exact JSON Schema files, TS public definitions, migration/validation tests, parser security bounds and feature certification require Sprint 1/2 work. D-06/07/08/09/11 still open; S0-05/06/07/08 must refine their boundaries without silently changing this ADR. Numeric hard limits and final package export names pending. Examples synthetic.