// Offline policy core. Call only with normalized evidence from trusted adapters
// and policy from the protected base. This module does not authenticate inputs.
const sha = (value) =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const id = (value) => Number.isSafeInteger(value) && value > 0;
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const everyItem = (value, predicate) =>
  Array.isArray(value) && [...value].every(predicate);
const sameCandidate = (a, b) =>
  a?.repositoryId === b.repositoryId &&
  a.pullNumber === b.pullNumber &&
  a.headSha === b.headSha &&
  a.baseSha === b.baseSha &&
  a.mergeSha === b.mergeSha;

const validPath = (path) =>
  typeof path === "string" &&
  !path.includes("\\") &&
  !Array.from(path).some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  ) &&
  path.split("/").every((part) => part && part !== "." && part !== "..");

function alwaysSensitive(path) {
  return (
    /^(?:\.github\/|docs\/(?:architecture|decisions|planning|specifications)\/|scripts\/review-gate\/)/i.test(
      path,
    ) ||
    /^(?:\.nvmrc|pnpm-workspace\.yaml|turbo\.json|eslint\.config\.mjs|scripts\/smoke-consumer\.mjs)$/i.test(
      path,
    ) ||
    /(?:^|\/)(?:AGENTS\.md|package\.json|[^/]*lock(?:\.json|\.yaml|\.yml)?|auth|security|policy|presets?|governance|releases?|publish|deploy)(?:\/|$)/i.test(
      path,
    )
  );
}

export function evaluateCandidate(policy, evidence) {
  const blocked = (reason) => ({ eligible: false, reason });
  if (!record(policy) || !record(evidence))
    return blocked("evidence-malformed");
  const { candidate, scope, diff, ci, review, discussion, approval } = evidence;
  if (
    !candidate ||
    !id(candidate.repositoryId) ||
    candidate.repositoryId !== policy.repositoryId ||
    !id(candidate.pullNumber) ||
    candidate.baseRef !== "main" ||
    !sha(candidate.headSha) ||
    !sha(candidate.baseSha) ||
    candidate.baseSha !== policy.baseSha ||
    !sha(candidate.mergeSha) ||
    candidate.open !== true ||
    candidate.draft !== false ||
    candidate.upToDate !== true ||
    candidate.mergeable !== true
  ) {
    return blocked("candidate-unavailable-or-stale");
  }
  if (
    !scope ||
    scope.baseSha !== candidate.baseSha ||
    scope.pullNumber !== candidate.pullNumber ||
    !id(scope.issueNumber) ||
    scope.issueOpen !== true ||
    scope.approvedSprint !== true ||
    !everyItem(
      scope.dependencies,
      (dependency) =>
        dependency?.completed === true && id(dependency.issueNumber),
    ) ||
    !everyItem(
      scope.paths,
      (entry) =>
        validPath(entry?.path) && ["routine", "sensitive"].includes(entry.risk),
    ) ||
    new Set(scope.paths.map((entry) => entry.path)).size !==
      scope.paths.length ||
    !sameCandidate(diff, candidate) ||
    diff.complete !== true ||
    !everyItem(diff.paths, validPath) ||
    diff.paths.length === 0
  ) {
    return blocked("scope-unverified");
  }

  const scopePaths = new Map(scope.paths.map(({ path, risk }) => [path, risk]));
  if (!diff.paths.every((path) => scopePaths.has(path))) {
    return blocked("outside-approved-scope");
  }
  const sensitive = diff.paths.some(
    (path) => alwaysSensitive(path) || scopePaths.get(path) === "sensitive",
  );
  if (
    !id(policy.ciAppId) ||
    typeof policy.ciContext !== "string" ||
    policy.ciContext.length === 0 ||
    !Array.isArray(ci) ||
    ci.filter((check) => check?.name === policy.ciContext).length !== 1 ||
    !ci.some(
      (check) =>
        check?.name === policy.ciContext &&
        check.appId === policy.ciAppId &&
        check.sha === candidate.mergeSha &&
        check.status === "completed" &&
        check.conclusion === "success",
    )
  ) {
    return blocked("ci-unverified");
  }
  if (
    !id(candidate.authorId) ||
    !id(policy.reviewerAppId) ||
    !id(policy.reviewerActorId) ||
    policy.reviewerAppId === policy.ciAppId ||
    !sameCandidate(review, candidate) ||
    review.appId !== policy.reviewerAppId ||
    review.actorId !== policy.reviewerActorId ||
    review.actorId === candidate.authorId ||
    review.policySha !== policy.baseSha ||
    review.verdict !== "clean" ||
    review.openFindings !== 0 ||
    !sameCandidate(discussion, candidate) ||
    discussion.allThreadsResolved !== true ||
    discussion.outstandingChangeRequests !== false
  ) {
    return blocked("independent-review-unverified");
  }
  if (
    sensitive &&
    (!sameCandidate(approval, candidate) ||
      !id(approval.actorId) ||
      approval.actorId === candidate.authorId ||
      !Array.isArray(policy.maintainerIds) ||
      !policy.maintainerIds.includes(approval.actorId) ||
      approval.state !== "approved")
  ) {
    return blocked("maintainer-approval-required");
  }
  return { eligible: true, risk: sensitive ? "sensitive" : "routine" };
}

export function reconcileMerge(policy, evidence, merge = {}) {
  if (
    !evaluateCandidate(policy, evidence).eligible ||
    !sameCandidate(merge, evidence.candidate) ||
    merge.method !== "squash" ||
    merge.merged !== true ||
    merge.onProtectedMain !== true ||
    !sha(merge.commitSha) ||
    merge.acceptanceVerified !== true ||
    merge.issueNumber !== evidence.scope.issueNumber
  ) {
    return "hold";
  }
  if (merge.issueState === "open") return "record-and-close";
  if (
    merge.issueState === "completed" &&
    merge.completionCommit === merge.commitSha
  ) {
    return "already-complete";
  }
  return "hold";
}
