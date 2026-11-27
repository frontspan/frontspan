# Sprint 0 — Product & Engineering Specification

Goal: a development-ready repository and accepted contracts for the first implementation slices. No application code or dependency installation in this sprint unless explicitly approved as a research spike.

| Task | Deliverable | Dependencies |
|---|---|---|
| S0-01 | Product baseline, scope, decision register and initial roadmap | none |
| S0-02 | Toolchain, support matrix, release and CI decisions (D-01/D-10) | S0-01 |
| S0-03 | OpenAPI/codegen research and compatibility proposal (D-04/D-06) | S0-01 |
| S0-04 | Configuration and normalized IR contracts (D-03/D-05) | S0-03 |
| S0-05 | Codegen ownership and sync specification (D-06/D-07) | S0-04 |
| S0-06 | HTTP/query contracts and proxy threat model (D-08/D-09/D-11) | S0-04 |
| S0-07 | Local CLI/Studio design (D-02) | S0-04 |
| S0-08 | Synthetic pilot fixtures and baseline measurement plan (D-12) | S0-03 |
| S0-09 | Sprint 1 issue breakdown, dependencies and acceptance criteria | S0-02, S0-04 |
| S0-10 | Maintainer review and readiness gate | S0-01 through S0-09 |

S0-02 and S0-03 may proceed in parallel after baseline review. Subsequent items can overlap when contracts are stable. Estimates and assignees are deliberately unset.

## Exit criteria

- Product scope and accepted ADRs approved; open decisions recorded, not silently inferred.
- Foundation contracts, toolchain and security requirements accepted before implementation.
- At least one representative synthetic contract and pilot measurement plan specified.
- Sprint 1 tasks include dependencies, scope exclusions, acceptance criteria and verification steps.
- Agent instructions and PR workflow reviewed. No secret or proprietary artifacts in public Git.
- Remaining later-sprint decisions have owners or explicit blockers; do not require every future module to be fully designed.
