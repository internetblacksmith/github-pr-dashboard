import { describe, it, expect, beforeAll } from "vitest";
import { loadSource } from "./helpers.js";

var mod;

beforeAll(function () {
  mod = loadSource("github.js");
});

describe("hasUnrespondedComments", function () {
  it("returns false when there are no review threads", function () {
    var pr = { reviewThreads: { nodes: [] } };
    expect(mod.hasUnrespondedComments(pr, "me")).toBe(false);
  });

  it("returns false when all threads are resolved", function () {
    var pr = {
      reviewThreads: {
        nodes: [{
          isResolved: true,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    };
    expect(mod.hasUnrespondedComments(pr, "me")).toBe(false);
  });

  it("returns false when the author is the last commenter", function () {
    var pr = {
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [
            { author: { login: "reviewer" } },
            { author: { login: "me" } },
          ] },
        }],
      },
    };
    expect(mod.hasUnrespondedComments(pr, "me")).toBe(false);
  });

  it("returns true when a reviewer is the last commenter", function () {
    var pr = {
      reviewThreads: {
        nodes: [{
          isResolved: false,
          comments: { nodes: [{ author: { login: "reviewer" } }] },
        }],
      },
    };
    expect(mod.hasUnrespondedComments(pr, "me")).toBe(true);
  });

  it("returns false when comments array is empty", function () {
    var pr = {
      reviewThreads: {
        nodes: [{ isResolved: false, comments: { nodes: [] } }],
      },
    };
    expect(mod.hasUnrespondedComments(pr, "me")).toBe(false);
  });

  it("handles missing reviewThreads gracefully", function () {
    expect(mod.hasUnrespondedComments({}, "me")).toBe(false);
    expect(mod.hasUnrespondedComments({ reviewThreads: null }, "me")).toBe(false);
  });
});

