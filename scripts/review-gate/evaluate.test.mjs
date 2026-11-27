import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCandidate, reconcileMerge } from "./evaluate.mjs";

function fixture() {
  const policy = {
    repositoryId: 11,
    baseSha: "a".repeat(40),
    ciContext: "Workspace and consumer smoke",
    ciAppId: 22,
    reviewerAppId: 33,
    reviewerActorId: 44,
    maintainerIds: [55],
  };
  const subject = {
    repositoryId: policy.repositoryId,
    pullNumber: 66,
    headSha: "b".repeat(40),
    baseSha: policy.baseSha,
    mergeSha: "c".repeat(40),
  };
  const evidence = {
    candidate: {
      ...subject,
      baseRef: "main",
      authorId: 77,
      open: true,
      draft: false,
      upToDate: true,
      mergeable: true,
    },
    scope: {
      baseSha: policy.baseSha,
      pullNumber: subject.pullNumber,
      issueNumber: 88,
      issueOpen: true,
      approvedSprint: true,
      dependencies: [{ issueNumber: 99, completed: true }],
      paths: [{ path: "README.md", risk: "routine" }],
    },
    ci: [
      {
        name: policy.ciContext,
        appId: policy.ciAppId,
        sha: subject.mergeSha,
        status: "completed",
        conclusion: "success",
      },
    ],
    review: {
      ...subject,
      policySha: policy.baseSha,
      appId: policy.reviewerAppId,
      actorId: policy.reviewerActorId,
      verdict: "clean",
      openFindings: 0,
    },
    diff: { ...subject, complete: true, paths: ["README.md"] },
    discussion: {
      ...subject,
      allThreadsResolved: true,
      outstandingChangeRequests: false,
    },
  };
  return { policy, evidence, subject };
}

const blocked = (reason) => ({ eligible: false, reason });

test("accepts only verified positive evidence for a routine candidate", () => {
  const { policy, evidence } = fixture();
  assert.deepEqual(evaluateCandidate(policy, evidence), {
    eligible: true,
    risk: "routine",
  });
  assert.equal(evaluateCandidate().eligible, false);
});

for (const [name, mutate] of Object.entries({
  "no verdict": (e) => delete e.review,
  "comment text alone": (e) => {
    e.review = { body: "Approved" };
  },
  "wrong reviewer source": (e) => {
    e.review.appId = 123;
  },
  "wrong reviewer actor": (e) => {
    e.review.actorId = 123;
  },
  "reviewer also authored the PR": (e) => {
    e.candidate.authorId = e.review.actorId;
  },
  "failed review": (e) => {
    e.review.verdict = "failed";
  },
  findings: (e) => {
    e.review.openFindings = 1;
  },
  "unresolved thread": (e) => {
    e.discussion.allThreadsResolved = false;
  },
  "outstanding change request": (e) => {
    e.discussion.outstandingChangeRequests = true;
  },
  "different PR": (e) => {
    e.review.pullNumber += 1;
  },
  "new head": (e) => {
    e.discussion.headSha =
      e.diff.headSha =
      e.candidate.headSha =
        "d".repeat(40);
  },
  "new base after candidate refresh": (e, p) => {
    p.baseSha =
      e.diff.baseSha =
      e.discussion.baseSha =
      e.candidate.baseSha =
      e.scope.baseSha =
        "d".repeat(40);
  },
  "wrong policy revision": (e) => {
    e.review.policySha = "d".repeat(40);
  },
})) {
  test(`blocks independent review: ${name}`, () => {
    const { policy, evidence } = fixture();
    mutate(evidence, policy);
    assert.deepEqual(
      evaluateCandidate(policy, evidence),
      blocked("independent-review-unverified"),
    );
  });
}

for (const [name, mutate] of Object.entries({
  "wrong source": (e) => {
    e.ci[0].appId = 123;
  },
  "duplicate context": (e) => {
    e.ci.push({ ...e.ci[0] });
  },
  "wrong SHA": (e) => {
    e.ci[0].sha = e.candidate.headSha;
  },
  skipped: (e) => {
    e.ci[0].conclusion = "skipped";
  },
  neutral: (e) => {
    e.ci[0].conclusion = "neutral";
  },
  failure: (e) => {
    e.ci[0].conclusion = "failure";
  },
  missing: (e) => {
    e.ci = [];
  },
})) {
  test(`blocks required CI: ${name}`, () => {
    const { policy, evidence } = fixture();
    mutate(evidence);
    assert.deepEqual(
      evaluateCandidate(policy, evidence),
      blocked("ci-unverified"),
    );
  });
}

test("protected workflow, instruction and policy edits cannot self-classify as routine", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "packages/core/AGENTS.md",
    "docs/planning/AUTONOMOUS-DEVELOPMENT.md",
    "pnpm-lock.yaml",
    "scripts/review-gate/evaluate.mjs",
    "scripts/smoke-consumer.mjs",
  ]) {
    const { policy, evidence, subject } = fixture();
    evidence.scope.paths = [{ path, risk: "routine" }];
    evidence.diff.paths = [path];
    assert.deepEqual(
      evaluateCandidate(policy, evidence),
      blocked("maintainer-approval-required"),
    );
    evidence.approval = { ...subject, actorId: 123, state: "approved" };
    assert.deepEqual(
      evaluateCandidate(policy, evidence),
      blocked("maintainer-approval-required"),
    );
    evidence.approval = {
      ...subject,
      actorId: 55,
      state: "approved",
      headSha: "d".repeat(40),
    };
    assert.deepEqual(
      evaluateCandidate(policy, evidence),
      blocked("maintainer-approval-required"),
    );
    evidence.approval.headSha = subject.headSha;
    assert.deepEqual(evaluateCandidate(policy, evidence), {
      eligible: true,
      risk: "sensitive",
    });
  }
});

test("blocks out-of-scope changes, incomplete diff, and unmet dependencies", () => {
  const { policy, evidence } = fixture();
  evidence.diff.paths.push("AGENTS.md");
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("outside-approved-scope"),
  );
  evidence.diff.paths.pop();
  evidence.diff.complete = false;
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("scope-unverified"),
  );
  evidence.diff.complete = true;
  evidence.scope.dependencies[0].completed = false;
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("scope-unverified"),
  );
});

test("a concurrent base or test-merge change cannot reuse earlier evidence", () => {
  const { policy, evidence } = fixture();
  assert.equal(evaluateCandidate(policy, evidence).eligible, true);
  const newBase = { ...policy, baseSha: "d".repeat(40) };
  assert.deepEqual(
    evaluateCandidate(newBase, evidence),
    blocked("candidate-unavailable-or-stale"),
  );
  evidence.diff.mergeSha =
    evidence.discussion.mergeSha =
    evidence.candidate.mergeSha =
      "e".repeat(40);
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("ci-unverified"),
  );
  evidence.ci[0].sha = evidence.candidate.mergeSha;
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("independent-review-unverified"),
  );
});

test("rejects stale diff and discussion snapshots even when CI and review are current", () => {
  const { policy, evidence } = fixture();
  evidence.candidate.headSha = evidence.review.headSha = "d".repeat(40);
  evidence.ci[0].sha =
    evidence.candidate.mergeSha =
    evidence.review.mergeSha =
      "e".repeat(40);
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("scope-unverified"),
  );
  evidence.diff.headSha = evidence.candidate.headSha;
  evidence.diff.mergeSha = evidence.candidate.mergeSha;
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("independent-review-unverified"),
  );
});

test("rejects malformed evidence and sparse path or dependency arrays", () => {
  const { policy, evidence } = fixture();
  assert.deepEqual(
    evaluateCandidate(policy, null),
    blocked("evidence-malformed"),
  );
  assert.deepEqual(
    evaluateCandidate(null, evidence),
    blocked("evidence-malformed"),
  );
  evidence.diff.paths = new Array(1);
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("scope-unverified"),
  );
  evidence.diff.paths = ["README.md"];
  evidence.scope.dependencies = new Array(1);
  assert.deepEqual(
    evaluateCandidate(policy, evidence),
    blocked("scope-unverified"),
  );
});

test("reconciliation requires a matching verified squash merge and is idempotent", () => {
  const { policy, evidence, subject } = fixture();
  const merge = {
    ...subject,
    method: "squash",
    merged: true,
    onProtectedMain: true,
    commitSha: "d".repeat(40),
    acceptanceVerified: true,
    issueNumber: 88,
    issueState: "open",
  };
  assert.equal(reconcileMerge(policy, evidence), "hold");
  for (const variant of [
    { merged: false },
    { method: "merge" },
    { onProtectedMain: false },
    { baseSha: "e".repeat(40) },
    { acceptanceVerified: false },
    { issueNumber: 123 },
  ]) {
    assert.equal(
      reconcileMerge(policy, evidence, { ...merge, ...variant }),
      "hold",
    );
  }
  assert.equal(reconcileMerge(policy, evidence, merge), "record-and-close");
  assert.equal(
    reconcileMerge(policy, evidence, { ...merge, issueState: "completed" }),
    "hold",
  );
  assert.equal(
    reconcileMerge(policy, evidence, {
      ...merge,
      issueState: "completed",
      completionCommit: merge.commitSha,
    }),
    "already-complete",
  );
});
