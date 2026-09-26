/**
 * Attention score engine.
 *
 * Assigns each PR a score from 0-100 based on urgency signals,
 * plus a human-readable reason explaining why it scored that way.
 *
 * Depends on: github.js (hasUnrespondedComments)
 * Uses hasUnrespondedComments from github.js via shared global scope.
 *
 * Score algorithm v1:
 *
 *   ┌─────────────────────────────────────┬────────┐
 *   │ Signal                              │ Weight │
 *   ├─────────────────────────────────────┼────────┤
 *   │ Unresponded reviewer feedback       │ +30    │
 *   │ Review needed, nobody approved yet  │ +25    │
 *   │ Teammate's PR, nobody approved yet  │ +15    │
 *   │ Staleness (>24h/48h/72h)            │ +5/10/15│
 *   │ Changes requested on your PR        │ +10    │
 *   │ Draft PR                            │ x0.5   │
 *   └─────────────────────────────────────┴────────┘
 *
 * Zone thresholds: Act now = 40+, On your radar = 10-39, All clear = <10
 *
 * Review Requested column tiers (returned as `tier`):
 *   1 = requested from you and still needs a review
 *   2 = a teammate's PR (pr.source === "teammates") that still needs a review
 *   3 = settled: approved by anyone, reviewed by you, or draft
 */

var SCORE_WEIGHTS = {
  UNRESPONDED: 30,
  PENDING_REVIEW: 25,
  TEAM_REVIEW: 15,
  STALE_72H: 15,
  STALE_48H: 10,
  STALE_24H: 5,
  CHANGES_REQUESTED: 10,
  DRAFT_MULTIPLIER: 0.5,
};


var MS_PER_HOUR = 3600000;

/**
 * Score a single PR.
 * @param {object} pr - PR object from GitHub GraphQL
 * @param {string} username - current user's GitHub login
 * @param {string} context - "authored" | "review-requested" | "personal"
 * @returns {{ score: number, reason: string, needsReview: boolean, tier: number }}
 *   needsReview is true for review-requested PRs that still need a review
 *   from you: nobody has approved yet, you haven't submitted one, not a draft.
 *   tier orders the Review Requested column (see header comment).
 */
function scorePr(pr, username, context) {
  if (!pr) return { score: 0, reason: "", needsReview: false, tier: 3 };

  var score = 0;
  var reasons = [];

  // Signal: unresponded reviewer feedback (authored PRs only)
  if (context === "authored" && hasUnrespondedComments(pr, username)) {
    score += SCORE_WEIGHTS.UNRESPONDED;
    reasons.push(t("reasonUnresponded"));
  }

  // Signal: the PR still needs a review (review-requested PRs only).
  // One approval from anyone settles it — a PR someone else already approved
  // is not waiting on you, so it gets no bonus and no highlight. Drafts are
  // never "waiting" either. A teammate's PR nobody asked you about scores
  // lower than an explicit request but still surfaces.
  var fromTeammate = pr.source === "teammates";
  var needsReview = context === "review-requested"
    && !pr.isDraft
    && isReviewPending(pr, username)
    && !hasAnyApproval(pr);
  if (needsReview) {
    score += fromTeammate ? SCORE_WEIGHTS.TEAM_REVIEW : SCORE_WEIGHTS.PENDING_REVIEW;
    reasons.push(t(fromTeammate ? "reasonTeamReview" : "reasonReviewPending"));
  }

  // Signal: staleness
  var hoursStale = getHoursStale(pr);
  if (hoursStale >= 72) {
    score += SCORE_WEIGHTS.STALE_72H;
    reasons.push(t("reasonDaysStale", Math.floor(hoursStale / 24)));
  } else if (hoursStale >= 48) {
    score += SCORE_WEIGHTS.STALE_48H;
    reasons.push(t("reasonDaysStale", Math.floor(hoursStale / 24)));
  } else if (hoursStale >= 24) {
    score += SCORE_WEIGHTS.STALE_24H;
    reasons.push(t("reason1dStale"));
  }

  // Signal: changes requested on your PR (authored PRs only)
  if (context === "authored" && pr.reviewDecision === "CHANGES_REQUESTED") {
    score += SCORE_WEIGHTS.CHANGES_REQUESTED;
    reasons.push(t("reasonChangesRequested"));
  }

  // Penalty: draft PRs
  if (pr.isDraft) {
    score = Math.round(score * SCORE_WEIGHTS.DRAFT_MULTIPLIER);
    if (reasons.length > 0) {
      reasons.push(t("reasonDraft"));
    }
  }

  // Cap at 0-100
  score = Math.max(0, Math.min(100, score));

  var tier = 3;
  if (needsReview) tier = fromTeammate ? 2 : 1;

  return {
    score: score,
    reason: reasons.join(" · "),
    needsReview: needsReview,
    tier: tier,
  };
}

/**
 * True when the PR already carries an approval from anyone.
 * reviewDecision covers repos with required reviews; the review list covers
 * repos without branch protection, where reviewDecision stays null.
 */
function hasAnyApproval(pr) {
  if (pr.reviewDecision === "APPROVED") return true;
  var reviews = (pr.reviews && pr.reviews.nodes) || [];
  for (var i = 0; i < reviews.length; i++) {
    if (reviews[i].state === "APPROVED") return true;
  }
  return false;
}


/**
 * Check whether the user's review is still pending on this PR.
 *
 * A PR lands in the review-requested search either because the user is
 * requested directly or because one of their teams is. A direct request
 * always means pending — GitHub drops you from the requested list when you
 * submit a review, so still being there means someone re-requested you.
 * A team request counts as pending until the user has submitted a review.
 */
function isReviewPending(pr, username) {
  if (isDirectlyRequested(pr, username)) return true;
  return !hasUserReviewed(pr, username);
}

/**
 * True when the user appears by name in the PR's outstanding review requests.
 */
function isDirectlyRequested(pr, username) {
  var requests = (pr.reviewRequests && pr.reviewRequests.nodes) || [];
  for (var i = 0; i < requests.length; i++) {
    var reviewer = requests[i].requestedReviewer;
    if (reviewer && reviewer.login === username) return true;
  }
  return false;
}

/**
 * Check if the user has already submitted a review on this PR.
 * Iterates all reviews looking for one authored by the user.
 */
function hasUserReviewed(pr, username) {
  var reviews = (pr.reviews && pr.reviews.nodes) || [];
  for (var i = 0; i < reviews.length; i++) {
    if (reviews[i].author && reviews[i].author.login === username) {
      return true;
    }
  }
  return false;
}

/**
 * Get hours since last activity (updatedAt).
 */
function getHoursStale(pr) {
  if (!pr.updatedAt) return 0;
  var updated = new Date(pr.updatedAt);
  if (isNaN(updated.getTime())) return 0;
  return Math.max(0, (Date.now() - updated.getTime()) / MS_PER_HOUR);
}

