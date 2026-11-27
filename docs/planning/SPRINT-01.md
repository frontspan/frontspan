# Sprint 1 — Foundation engineering

Status: Sprint 1 execution authorized in #10; #20–22 completed. No dates or assignees. Follow AGENTS.md and ISSUE-WORKFLOW.md. All issues must verify dependencies and claim work before coding. Do not merge application code without passing applicable CI and review.

| Task | Issue | Dependencies |
|---|---|---|
| S1-01 Workspace and toolchain bootstrap | #20 | S0-10 |
| S1-02 CI and repository quality gates | #21 | #20 (bootstrap CI co-developed as described below) |
| S1-03 Core configuration schema and loader | #22 | #20, #21 |
| S1-04 Preset resolution and effective policy | #23 | #22 |
| S1-05 Config edit, migration and revision foundation | #24 | #22, #23 |
| S1-06 CLI foundation and offline validation | #25 | #22–24 |
| S1-07 Incremental install and scaffold planning | #26 | #25 |
| S1-08 Foundation integration and Sprint 2 gate | #27 | #21, #24, #26 |

## Bootstrap gate

To avoid a CI bootstrap dependency cycle, S1-01 includes the minimal PR CI required to validate its own root scripts (lint, typecheck, test, build, frozen install). S1-02 expands this into matrix/quality gates after #20 merges. This is a sequencing clarification, not permission to bypass review or CI. If required CI or review gates cannot run, stop and report. #21 CI foundation completed; the trusted review gate follow-up #33 is blocked. The maintainer accepted the reduced-assurance [delegated development policy](AUTONOMOUS-DEVELOPMENT.md), with native CI and procedural independent review for routine tasks. Organization rulesets/permissions require explicit authorization. Exact version pin, npm ownership and release workflow remain verification/approval tasks; no publishing.

## Sprint boundary

Foundation only. No OpenAPI parser integration, code generation engine, proxy runtime, Studio UI or release publishing. Synthetic fixtures only. Each issue defines exact acceptance criteria and tests. Do not work ahead on unapproved changes. Agent should use the first eligible issue, separate branch, implementation PR and verified evidence; then proceed in dependency order only when prior work is merged/closed. Review may require human action. No estimates until actual bootstrap results.

Exit: passing CI, verified exact toolchain, strict configuration/presets, safe edit foundation, offline CLI, installation/scaffold plan and packed consumer smoke. Report unresolved security/compatibility, prepare Sprint 2 backlog separately.