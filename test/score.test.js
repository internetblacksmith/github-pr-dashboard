import { describe, it, expect, beforeAll } from "vitest";
import { loadSource } from "./helpers.js";

var github;
var score;

beforeAll(function () {
  github = loadSource("github.js");
  score = loadSource("score.js", {
    // score.js depends on github.js globals
    hasUnrespondedComments: github.hasUnrespondedComments,
    t: function (key) { return key; },
  });
});

function makePr(overrides) {
  return {
    title: "Test PR",
    url: "https://github.com/org/repo/pull/1",
    number: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDraft: false,
    repository: { nameWithOwner: "org/repo" },
    author: { login: "testuser", avatarUrl: "https://avatars.githubusercontent.com/u/1" },
    reviewDecision: null,
    additions: 10,
    deletions: 5,
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  };
}

describe("scorePr", function () {
  it("returns 0 for a PR with no signals", function () {
    var pr = makePr({});
    var result = score.scorePr(pr, "testuser", "authored");
    expect(result.score).toBe(0);
    expect(result.reason).toBe("");
  });

  it("returns 0 for null PR", function () {
    var result = score.scorePr(null, "testuser", "authored");
    expect(result.score).toBe(0);
  });

  it("scores +30 for unresponded reviewer feedback", function () {
    var pr = makePr({
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    });
    var result = score.scorePr(pr, "testuser", "authored");
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.reason).toContain("reasonUnresponded");
  });

  it("does not score unresponded feedback for review-requested context", function () {
    var pr = makePr({
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.reason).not.toContain("reasonUnresponded");
  });

  it("scores +25 for pending review not started", function () {
    var pr = makePr({ reviews: { nodes: [] } });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.reason).toContain("reasonReviewPending");
  });

  it("does not score pending review if user already reviewed", function () {
    var pr = makePr({
      reviews: { nodes: [{ author: { login: "testuser" } }] },
    });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.reason).not.toContain("reasonReviewPending");
  });

  it("scores staleness at graduated levels", function () {
    var now = Date.now();

    var pr25h = makePr({ updatedAt: new Date(now - 25 * 3600000).toISOString() });
    var result25 = score.scorePr(pr25h, "testuser", "authored");
    expect(result25.score).toBe(5);

    var pr49h = makePr({ updatedAt: new Date(now - 49 * 3600000).toISOString() });
    var result49 = score.scorePr(pr49h, "testuser", "authored");
    expect(result49.score).toBe(10);

    var pr73h = makePr({ updatedAt: new Date(now - 73 * 3600000).toISOString() });
    var result73 = score.scorePr(pr73h, "testuser", "authored");
    expect(result73.score).toBe(15);
  });

  it("scores +10 for changes requested", function () {
    var pr = makePr({ reviewDecision: "CHANGES_REQUESTED" });
    var result = score.scorePr(pr, "testuser", "authored");
    expect(result.score).toBe(10);
    expect(result.reason).toContain("reasonChangesRequested");
  });

  it("halves score for draft PRs", function () {
    var pr = makePr({
      isDraft: true,
      reviewDecision: "CHANGES_REQUESTED",
    });
    var result = score.scorePr(pr, "testuser", "authored");
    expect(result.score).toBe(5); // 10 * 0.5
    expect(result.reason).toContain("reasonDraft");
  });

  it("combines multiple signals correctly", function () {
    var now = Date.now();
    var pr = makePr({
      updatedAt: new Date(now - 73 * 3600000).toISOString(),
      reviewDecision: "CHANGES_REQUESTED",
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    });
    var result = score.scorePr(pr, "testuser", "authored");
    // 30 (unresponded) + 15 (stale 72h) + 10 (changes requested) = 55
    expect(result.score).toBe(55);
  });

  it("caps score at 100", function () {
    var now = Date.now();
    var pr = makePr({
      updatedAt: new Date(now - 73 * 3600000).toISOString(),
      reviewDecision: "CHANGES_REQUESTED",
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    });
    var result = score.scorePr(pr, "testuser", "authored");
    expect(result.score).toBeLessThanOrEqual(100);
  });
});


describe("isReviewPending", function () {
  it("is pending when the user is explicitly requested, even after a prior review", function () {
    var pr = makePr({
      reviews: { nodes: [{ author: { login: "testuser" } }] },
      reviewRequests: { nodes: [{ requestedReviewer: { login: "testuser" } }] },
    });
    expect(score.isReviewPending(pr, "testuser")).toBe(true);
  });

  it("is pending when no review has been submitted (team request)", function () {
    var pr = makePr({ reviews: { nodes: [] }, reviewRequests: { nodes: [{ requestedReviewer: {} }] } });
    expect(score.isReviewPending(pr, "testuser")).toBe(true);
  });

  it("is not pending when only a team is requested and the user already reviewed", function () {
    var pr = makePr({
      reviews: { nodes: [{ author: { login: "testuser" } }] },
      reviewRequests: { nodes: [{ requestedReviewer: {} }] },
    });
    expect(score.isReviewPending(pr, "testuser")).toBe(false);
  });

  it("handles missing reviewRequests", function () {
    expect(score.isReviewPending(makePr({ reviewRequests: null }), "testuser")).toBe(true);
    expect(score.isReviewPending(makePr({}), "testuser")).toBe(true);
  });
});

describe("scorePr re-requested reviews", function () {
  it("scores +25 when the user is re-requested after reviewing", function () {
    var pr = makePr({
      reviews: { nodes: [{ author: { login: "testuser" } }] },
      reviewRequests: { nodes: [{ requestedReviewer: { login: "testuser" } }] },
    });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.score).toBe(25);
    expect(result.reason).toContain("reasonReviewPending");
  });
});

describe("hasAnyApproval", function () {
  it("is true from reviewDecision", function () {
    expect(score.hasAnyApproval(makePr({ reviewDecision: "APPROVED" }))).toBe(true);
  });

  it("is true from any APPROVED review, even without reviewDecision", function () {
    var pr = makePr({ reviewDecision: null, reviews: { nodes: [{ author: { login: "other" }, state: "APPROVED" }] } });
    expect(score.hasAnyApproval(pr)).toBe(true);
  });

  it("ignores comments, dismissed reviews and change requests", function () {
    var pr = makePr({ reviews: { nodes: [
      { author: { login: "a" }, state: "COMMENTED" },
      { author: { login: "b" }, state: "DISMISSED" },
      { author: { login: "c" }, state: "CHANGES_REQUESTED" },
    ] } });
    expect(score.hasAnyApproval(pr)).toBe(false);
  });

  it("handles missing reviews", function () {
    expect(score.hasAnyApproval(makePr({ reviews: null }))).toBe(false);
  });
});

describe("scorePr one-approval rule", function () {
  it("gives no pending bonus when someone else already approved", function () {
    var pr = makePr({ reviews: { nodes: [{ author: { login: "other" }, state: "APPROVED" }] } });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.score).toBe(0);
    expect(result.needsReview).toBe(false);
    expect(result.reason).not.toContain("reasonReviewPending");
  });

  it("flags needsReview when nobody approved and you haven't reviewed", function () {
    var result = score.scorePr(makePr({}), "testuser", "review-requested");
    expect(result.needsReview).toBe(true);
    expect(result.score).toBe(25);
  });

  it("does not flag needsReview when you already reviewed", function () {
    var pr = makePr({ reviews: { nodes: [{ author: { login: "testuser" }, state: "COMMENTED" }] } });
    expect(score.scorePr(pr, "testuser", "review-requested").needsReview).toBe(false);
  });

  it("re-request wins over your own earlier comment when nobody approved", function () {
    var pr = makePr({
      reviews: { nodes: [{ author: { login: "testuser" }, state: "COMMENTED" }] },
      reviewRequests: { nodes: [{ requestedReviewer: { login: "testuser" } }] },
    });
    expect(score.scorePr(pr, "testuser", "review-requested").needsReview).toBe(true);
  });

  it("never flags needsReview outside the review-requested column", function () {
    expect(score.scorePr(makePr({}), "testuser", "authored").needsReview).toBe(false);
  });
});

describe("teammates' PRs and tiers", function () {
  it("scores +15 with the team reason and tier 2 for a teammate PR nobody approved", function () {
    var pr = makePr({ source: "teammates", author: { login: "pal", avatarUrl: "" } });
    var result = score.scorePr(pr, "testuser", "review-requested");
    expect(result.score).toBe(15);
    expect(result.reason).toContain("reasonTeamReview");
    expect(result.needsReview).toBe(true);
    expect(result.tier).toBe(2);
  });

  it("puts a requested PR that needs you in tier 1 with +25", function () {
    var result = score.scorePr(makePr({ source: "requested" }), "testuser", "review-requested");
    expect(result.tier).toBe(1);
    expect(result.score).toBe(25);
  });

  it("defaults to the requested weight when source is absent", function () {
    var result = score.scorePr(makePr({}), "testuser", "review-requested");
    expect(result.tier).toBe(1);
    expect(result.score).toBe(25);
  });

  it("settles a teammate PR once anyone approves or you reviewed", function () {
    var approved = makePr({ source: "teammates", reviews: { nodes: [{ author: { login: "x" }, state: "APPROVED" }] } });
    expect(score.scorePr(approved, "testuser", "review-requested").tier).toBe(3);
    var reviewed = makePr({ source: "teammates", reviews: { nodes: [{ author: { login: "testuser" }, state: "COMMENTED" }] } });
    expect(score.scorePr(reviewed, "testuser", "review-requested").tier).toBe(3);
  });

  it("never marks a draft as needing review, whatever the source", function () {
    var requestedDraft = score.scorePr(makePr({ isDraft: true }), "testuser", "review-requested");
    expect(requestedDraft.needsReview).toBe(false);
    expect(requestedDraft.tier).toBe(3);
    expect(requestedDraft.score).toBe(0);
    var teamDraft = score.scorePr(makePr({ isDraft: true, source: "teammates" }), "testuser", "review-requested");
    expect(teamDraft.tier).toBe(3);
  });

  it("tier is 3 outside the review-requested column and for null", function () {
    expect(score.scorePr(makePr({}), "testuser", "authored").tier).toBe(3);
    expect(score.scorePr(null, "testuser", "authored").tier).toBe(3);
  });
});

describe("isDirectlyRequested", function () {
  it("finds the user by login in outstanding requests", function () {
    var pr = makePr({ reviewRequests: { nodes: [{ requestedReviewer: {} }, { requestedReviewer: { login: "testuser" } }] } });
    expect(score.isDirectlyRequested(pr, "testuser")).toBe(true);
    expect(score.isDirectlyRequested(pr, "other")).toBe(false);
    expect(score.isDirectlyRequested(makePr({}), "testuser")).toBe(false);
  });
});
