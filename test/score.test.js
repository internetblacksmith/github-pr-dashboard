import { describe, it, expect, beforeAll, vi } from "vitest";
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

