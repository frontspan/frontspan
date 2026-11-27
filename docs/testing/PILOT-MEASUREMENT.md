# Pilot measurement and acceptance plan

Status: accepted measurement protocol and planning targets on 2026-11-28; no measured results. S0-08 (#8), D-12, 2026-11-28. [PRD](../product/PRD.md) and [scope](../product/SCOPE.md) require a representative read, pagination and mutation comparison and maintainer acceptance. [Fixture inventory](SYNTHETIC-FIXTURES.md) defines synthetic scenarios.

## Phases and entry gates

1. Synthetic bench: compare a manually integrated Next.js reference app and the same starting app using Frontspan. Use the same approved API contract, target runtime, feature requirements, tests and auth/security constraints. No company data.
2. Synthetic end-to-end: validate incremental install, Studio/CLI parity, contract evolution and direct/proxy deployment in isolated test environment. Require all mandatory MVP acceptance/security cases applicable to deployed functionality to pass. ADR-019/020 accepted; implementation verification required; no proxy or Studio network pilot before controls pass.
3. Authorized organization pilot: only after maintainer and relevant organization data/security owner explicitly approve scope, environment, access, retention and metrics. Prefer nonproduction sandbox and synthetic or expressly authorized fixtures; real contract and generated source remain in authorized private workspace, never public repo. No automatic production traffic, telemetry, publishing or credential collection. Document actual approved authority; no implied approval from this task.

## Fair baseline and measurement

Start both methods from identical clean commits of an existing App Router project with its existing auth/provider setup; same API/schema version, UI requirements and test suite. Manual workflow uses ordinary team practices (Fetch/TanStack Query/Zod if typical), not an intentionally inefficient straw man. If an incumbent generator is normally used, record it and optionally benchmark that separately. Both methods include setup, implementation, debugging, tests and review; exclude unrelated UI design work equally. Record first-time setup separately and total end-to-end time including setup. Freeze task definitions, tool versions, acceptance tests and target criteria before timed runs. Use comparable developers or crossover/counterbalanced order with alternate equivalent tasks, at least two participants or repeated trials if feasible; if only one developer and one run, label exploratory, not causal evidence. Same AI assistance policy for both arms; record tool/model/time spent if used. Separate active minutes from elapsed wall-clock and blocked waiting; do not exclude Frontspan learning/debugging. No fabricated time estimates or results.

| Task | Done condition |
|---|---|
| Read | Product detail/list with typed service, loading/error state, tests and validation |
| Pagination | Authenticated orders list with mapped response, page controls, correct errors and isolated cache |
| Mutation | Create/update order, validation, explicit post-success invalidation and error UI |
| Evolution | Apply equivalent compatible and breaking candidate updates with correct review, code changes, tests and no lost manual files |
| Installation | Existing app integration without rewrite, reproducible build and package lock |
| Review | Reviewer verifies same functional/security checklist in both arms |

Record time per task from first action to passing agreed tests/review, with active time, setup and rework tracked separately. Include tool installation and docs discovery. Do not count generated lines as time saved. Use identical review checklist, log defects by severity and time to fix. Record errors surfaced before runtime vs during test/review, not just total diagnostics. Keep per-trial rows and report median, range and sample size; no statistical claims from small samples. Relative time saving = (manual active minutes - Frontspan active minutes) / manual active minutes * 100; undefined when manual is zero. Compare first integration including setup and subsequent incremental tasks separately; optionally report break-even after measured setup cost. Sync timing compares same baseline/candidate contracts, not artificially simpler updates. Runtime overhead measured against equivalent manual proxy path with same network/response/validation workload; use warmup, bounded concurrency and repeated samples, record p50/p95 and payload size, do not compare direct and proxy as identical work.

## Accepted pilot planning targets (not measured)

| Metric | Suggested threshold | Interpretation |
|---|---|---|
| Active integration time (read, pagination, mutation) | >=30% median reduction after initial setup | Candidate value target, not observed |
| Contract update effort | >=50% median reduction on paired evolution tasks | Includes review and fixes |
| Correctness | 100% mandatory fixture/acceptance cases pass | No omitted mandatory cases |
| Security | Zero unresolved critical/high findings; all mandatory security tests pass | Mandatory, not tradeable for speed |
| Generated source safety | Zero unintended overwrites/deletions in tested scenarios | Mandatory |
| Reproducibility | Identical bytes/digests across repeat approved generation inputs | Mandatory |
| Compatibility | All advertised supported matrix combinations pass defined gates | Advertise only verified support |
| Review defects | No increase in severe correctness/security defects vs manual workflow | Compare equal checklist, report counts and severity |
| Proxy overhead | Report p50/p95 and investigate regression; propose budget after baseline | No arbitrary production latency promise |

The 30% and 50% targets are accepted planning hypotheses, not measured results; confirm task definitions before pilot and do not retroactively adjust to make results pass. If target not met, report and decide iterate/narrow scope/stop; mandatory correctness/security gates cannot be waived by productivity gains. No public performance claim without measured and authorized evidence. Small-sample pilot indicates feasibility only.

## Evidence template (no real data)

    trial_id, task_id, method, anonymized_participant_code,
    commit, fixture_version, tool_versions, active_minutes,
    elapsed_minutes, setup_minutes, rework_minutes, blocked_minutes,
    tests_passed, tests_failed, tests_skipped, review_defects_by_severity,
    manual_files_changed, unexpected_write_count, notes_redacted

A release checklist links fixture IDs and CI results, compatibility matrix, security review and explicit sign-off. Keep individual-level records private if they identify employees; public report only approved aggregated synthetic metrics. No sensitive raw bodies/logs, internal URLs, tokens or personal data. Authorization and deletion/retention handled by organization owner. Frontspan has no required analytics collection.

## Decision and follow-up

Maintainer accepted the targets and fixture inventory on 2026-11-28; later sign-off based on evidence, not this document. Author actual fixtures and tests in corresponding implementation issues; use no implementation in Sprint 0. Pilot execution and company authorization remain future gates. Unknown sample size, actual performance, compatibility and organizational permission are explicit blockers to claims.