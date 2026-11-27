# Issue-first engineering workflow

Maintainer decision: GitHub Issues and repository planning documents are sufficient for agent-assisted development. No GitHub Projects dependency. Project boards, timeline views and burndown charts are optional and not required for execution.

## Source of truth

- Sprint plans in docs/planning/ define goals, task IDs, dependencies and readiness gates.
- GitHub Issues hold scope, acceptance criteria, dependencies, owner/claim, progress and evidence. Titles retain stable task IDs (e.g. S0-02).
- Pull requests hold review, changes and validation results; link the issue and use closing keywords only when the PR satisfies all criteria and required approvals.
- ADRs record approved architecture. A task may remain open after a draft design is delivered pending approval.

## Lifecycle

Use issue comments with a consistent prefix (Status: Backlog, Ready, In Progress, In Review, Blocked or Done). An open issue without a status is Backlog. Use equivalent labels when configured; labels and milestones are optional, never prerequisites. A closed issue is Done only when completion evidence exists; canceled/duplicate tasks must state the reason.

Before starting: inspect the active sprint, existing open PRs, issue comments and dependencies. Only claim a ready task; post status and intended scope. Avoid duplicate claims. For concurrent agents, the maintainer/coordinator allocates issues explicitly; comments are not atomic locks.

During work: use a separate branch/worktree, record blockers and new decisions in the issue, and link the PR. Follow AGENTS.md merge policy. Follow the [delegated development policy](AUTONOMOUS-DEVELOPMENT.md). Routine tasks may squash merge after verified CI and independent head-bound review under the delegated reduced-assurance procedure; no per-PR human approval required for routine scope. Native independent review enforcement is unavailable. Sensitive changes still require explicit maintainer approval. Correct findings and repeat review on new heads; stop on ambiguous, sensitive or repeatedly failing changes. After verifying actual merge on main and all acceptance evidence, record the PR, commit, CI and review evidence and close the completed issue. Reconcile already-closed issues idempotently, then claim the next eligible issue in the approved sprint. Do not close work solely because a PR exists.

At sprint review: query open/closed issues and linked PRs against the sprint plan. Report completed, blocked and remaining tasks; update the next sprint plan in Git. Do not invent calendar dates or estimates.

This workflow preserves executable sprint planning and auditability without a board. Native iteration fields, drag-and-drop Kanban, roadmap charts and project-level automation are not available under this model.
