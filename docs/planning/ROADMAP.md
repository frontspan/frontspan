# Roadmap

Logical sprint groups, not calendar commitments. Refine sizing after Sprint 0 and pilot evidence.

| Sprint | Outcome | Prerequisites |
|---|---|---|
| 0 | Reviewed product baseline, technical research, ADRs and actionable foundation backlog | repository |
| 1 | Monorepo, CI, core configuration, CLI and preset foundation | D-01, D-03, D-10 |
| 2 | OpenAPI import, reference resolution, IR and operation selection | D-04, D-05, core contracts |
| 3 | Generated types/services/Zod/query and Fetch contracts; synthetic integration | D-06, D-08, IR |
| 4 | Contract snapshots, deterministic sync, breaking-change review and CI | D-07, generation |
| 5 | Local Studio, config editing, contract diff, playground | D-02, stable development APIs |
| 6 | Basic server proxy, existing auth integration and pilot | D-09, D-11, D-12, MVP gates |

Aim for early end-to-end synthetic vertical slices rather than building isolated packages in full. Independent research can run in parallel; implementation must respect accepted contracts. Proxy threat modeling begins in Sprint 0 even though integration is later.

V2: composite BFF/security. V3: application toolkit/mocks/observability. V4: managed resources. Replan after pilot.
