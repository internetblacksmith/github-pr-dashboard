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
 *   │ Pending review you haven't started  │ +25    │
 *   │ Staleness (>24h/48h/72h)            │ +5/10/15│
 *   │ Changes requested on your PR        │ +10    │
 *   │ Draft PR                            │ x0.5   │
 *   └─────────────────────────────────────┴────────┘
 *
 * Zone thresholds: Act now = 40+, On your radar = 10-39, All clear = <10
 */

var SCORE_WEIGHTS = {
  UNRESPONDED: 30,
  PENDING_REVIEW: 25,
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
 * @returns {{ score: number, reason: string }}
 */
function scorePr(pr, username, context) {
  if (!pr) return { score: 0, reason: "" };

  var score = 0;
  var reasons = [];

  // Signal: unresponded reviewer feedback (authored PRs only)
  if (context === "authored" && hasUnrespondedComments(pr, username)) {
    score += SCORE_WEIGHTS.UNRESPONDED;
    reasons.push(t("reasonUnresponded"));
  }

  // Signal: pending review you haven't started (review-requested PRs only)
  if (context === "review-requested" && !hasUserReviewed(pr, username)) {
    score += SCORE_WEIGHTS.PENDING_REVIEW;
    reasons.push(t("reasonReviewPending"));
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

  return {
    score: score,
    reason: reasons.join(" · "),
  };
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

