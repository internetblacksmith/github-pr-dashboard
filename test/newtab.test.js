import { describe, it, expect, beforeAll } from "vitest";
import { loadSource } from "./helpers.js";

var mod;

beforeAll(function () {
  mod = loadSource("newtab.js", {
    // Stub browser globals that newtab.js needs at load time
    chrome: { storage: { local: { get: function () {}, set: function () {}, remove: function () {} } } },
    browser: undefined,
    api: { storage: { local: { get: function () {}, set: function () {}, remove: function () {} } }, i18n: { getMessage: function (key) { return key; } } },
    isFirefox: false,
    t: function (key) { return key; },
    document: {
      getElementById: function () {
        return { hidden: true, textContent: "", innerHTML: "", dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, querySelectorAll: function () { return []; }, setAttribute: function () {}, getAttribute: function () { return null; }, addEventListener: function () {} };
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      documentElement: { setAttribute: function () {} },
      createElement: function () {
        return { className: "", draggable: false, type: "", value: "", innerHTML: "", textContent: "", dataset: {}, appendChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, classList: { add: function () {}, remove: function () {} }, addEventListener: function () {} };
      },
      title: "",
      activeElement: null,
    },
    // Stub globals from other scripts loaded before newtab.js
    fetchUsername: async function () { return "testuser"; },
    fetchDashboardData: async function () { return {}; },
    hasUnrespondedComments: function () { return false; },
    // Score comes from the PR fixture so sorting tests can control it
    scorePr: function (pr) { return { score: pr.score || 0, reason: pr.reason || "", needsReview: !!pr.needsReview, tier: pr.tier || 3 }; },
    isDirectlyRequested: function (pr, username) {
      return ((pr.reviewRequests && pr.reviewRequests.nodes) || []).some(function (r) { return r.requestedReviewer && r.requestedReviewer.login === username; });
    },
    isValidLogin: function (l) { return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(l); },
  });
});

describe("escapeHtml", function () {
  it("escapes HTML entities", function () {
    expect(mod.escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("passes through safe strings", function () {
    expect(mod.escapeHtml("hello world")).toBe("hello world");
  });

  it("returns empty string for non-string input", function () {
    expect(mod.escapeHtml(null)).toBe("");
    expect(mod.escapeHtml(undefined)).toBe("");
    expect(mod.escapeHtml(123)).toBe("");
  });
});

describe("escapeAttr", function () {
  it("escapes attribute-unsafe characters", function () {
    expect(mod.escapeAttr('a"b<c>d&e\'f')).toBe("a&quot;b&lt;c&gt;d&amp;e&#39;f");
  });

  it("returns empty string for non-string input", function () {
    expect(mod.escapeAttr(null)).toBe("");
    expect(mod.escapeAttr(42)).toBe("");
  });
});

describe("isSafeUrl", function () {
  it("allows https URLs", function () {
    expect(mod.isSafeUrl("https://github.com")).toBe(true);
  });

  it("allows GitHub avatar hosts", function () {
    expect(mod.isSafeUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe(true);
  });

  it("blocks http even on GitHub", function () {
    expect(mod.isSafeUrl("http://github.com/org/repo/pull/1")).toBe(false);
  });

  it("blocks non-GitHub hosts and lookalikes", function () {
    expect(mod.isSafeUrl("https://example.com")).toBe(false);
    expect(mod.isSafeUrl("https://github.com.evil.io/x")).toBe(false);
    expect(mod.isSafeUrl("https://notgithub.com")).toBe(false);
  });

  it("blocks javascript: URLs", function () {
    expect(mod.isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks data: URLs", function () {
    expect(mod.isSafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  it("returns false for invalid URLs", function () {
    expect(mod.isSafeUrl("not a url")).toBe(false);
    expect(mod.isSafeUrl("")).toBe(false);
  });
});

describe("getOrgLookup", function () {
  it("creates a lookup from org config array", function () {
    var lookup = mod.getOrgLookup([
      { name: "MyOrg", color: "#ff0000" },
      { name: "other", color: "#00ff00" },
    ]);
    expect(lookup["myorg"].color).toBe("#ff0000");
    expect(lookup["myorg"].name).toBe("MyOrg");
    expect(lookup["other"].color).toBe("#00ff00");
  });

  it("returns empty object for empty array", function () {
    expect(mod.getOrgLookup([])).toEqual({});
  });
});

describe("timeAgo", function () {
  it("returns 'timeJustNow' for recent dates", function () {
    expect(mod.timeAgo(new Date().toISOString())).toBe("timeJustNow");
  });

  it("returns minutes ago", function () {
    var fiveMin = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(mod.timeAgo(fiveMin)).toBe("timeMinAgo");
  });

  it("returns hours ago", function () {
    var threeHours = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(mod.timeAgo(threeHours)).toBe("timeHourAgo");
  });

  it("returns days ago", function () {
    var twoDays = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    expect(mod.timeAgo(twoDays)).toBe("timeDayAgo");
  });

  it("returns 'timeUnknown' for invalid dates", function () {
    expect(mod.timeAgo("not-a-date")).toBe("timeUnknown");
  });
});

describe("friendlyError", function () {
  it("detects 502 errors", function () {
    var msg = mod.friendlyError(new Error("GitHub API 502"));
    expect(msg).toBe("errorGitHub");
  });

  it("detects 429 rate limit", function () {
    var msg = mod.friendlyError(new Error("429 after 3 attempts"));
    expect(msg).toBe("errorRateLimit");
  });

  it("detects 401 auth errors", function () {
    var msg = mod.friendlyError(new Error("GitHub API 401"));
    expect(msg).toBe("errorAuth");
  });

  it("detects network errors", function () {
    var msg = mod.friendlyError(new Error("Failed to fetch"));
    expect(msg).toBe("errorNetwork");
  });

  it("returns generic message for unknown errors", function () {
    var msg = mod.friendlyError(new Error("something weird"));
    expect(msg).toBe("errorGeneric");
  });
});

// --- Sorting ---

function scoredPr(owner, score, extra) {
  return Object.assign({
    title: "PR",
    url: "https://github.com/" + owner + "/repo/pull/" + score,
    number: score,
    createdAt: new Date().toISOString(),
    repository: { nameWithOwner: owner + "/repo" },
    author: { login: "someone", avatarUrl: "https://avatars.githubusercontent.com/u/1" },
    score: score,
  }, extra || {});
}

describe("scoreAndSort", function () {
  var orgConfig = [{ name: "First", color: "#111111" }, { name: "second", color: "#222222" }];

  it("orders by configured org order, then by score within an org", function () {
    var prs = [scoredPr("second", 90), scoredPr("first", 10), scoredPr("first", 50)];
    var out = mod.scoreAndSort(prs, "me", "authored", orgConfig);
    expect(out.map(function (i) { return i.orgName + ":" + i.score; })).toEqual(["first:50", "first:10", "second:90"]);
  });

  it("puts unconfigured orgs last, alphabetically, then by score", function () {
    var prs = [scoredPr("zeta", 99), scoredPr("alpha", 1), scoredPr("alpha", 40), scoredPr("first", 5)];
    var out = mod.scoreAndSort(prs, "me", "personal", orgConfig);
    expect(out.map(function (i) { return i.orgName + ":" + i.score; })).toEqual(["first:5", "alpha:40", "alpha:1", "zeta:99"]);
  });

  it("matches org names case-insensitively and tolerates a missing repository", function () {
    var prs = [scoredPr("FIRST", 1), { title: "orphan", url: "u", score: 70 }];
    var out = mod.scoreAndSort(prs, "me", "authored", orgConfig);
    expect(out[0].orgName).toBe("first");
    expect(out[1].orgName).toBe("");
  });
});

// --- Card rendering ---

describe("renderScoredCard", function () {
  function card(pr, score, context, needsReview) {
    return mod.renderScoredCard({ pr: pr, score: score || 0, reason: pr.reason || "", context: context || "authored", needsReview: !!needsReview }, {}, {});
  }

  it("escapes hostile titles, logins and repo names", function () {
    var html = card(scoredPr("org", 1, {
      title: '<img src=x onerror=alert(1)>',
      author: { login: '"><script>', avatarUrl: "https://avatars.githubusercontent.com/u/1" },
      repository: { nameWithOwner: "org/<b>repo</b>" },
    }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>repo</b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("neutralises unsafe PR and avatar URLs", function () {
    var html = card(scoredPr("org", 1, {
      url: "javascript:alert(1)",
      author: { login: "x", avatarUrl: "https://evil.example/a.png" },
    }));
    expect(html).toContain('href="#"');
    expect(html).toContain('src=""');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
  });

  it("keeps safe GitHub URLs and coerces numbers", function () {
    var html = card(scoredPr("org", 7, { additions: "12abc", deletions: null, number: "42" }));
    expect(html).toContain('href="https://github.com/org/repo/pull/7"');
    expect(html).toContain("#42");
    expect(html).toContain("+12");
    expect(html).toContain("-0");
  });

  it("maps score to a severity class and status badge", function () {
    expect(card(scoredPr("org", 1), 45)).toContain("severity-high");
    expect(card(scoredPr("org", 1), 15)).toContain("severity-medium");
    expect(card(scoredPr("org", 1), 0)).toContain("severity-low");
    expect(card(scoredPr("org", 1, { isDraft: true }))).toContain("status-badge draft");
    expect(card(scoredPr("org", 1, { reviewDecision: "APPROVED" }))).toContain("status-badge approved");
  });
});

// --- Cache freshness ---

describe("getCachedData", function () {
  var store;
  var cacheMod;

  function chromeWithStore() {
    return {
      storage: {
        local: {
          get: function (keys, cb) {
            var out = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { if (k in store) out[k] = store[k]; });
            cb(out);
          },
          set: function (data, cb) { Object.assign(store, data); if (cb) cb(); },
          remove: function (keys, cb) { [].concat(keys).forEach(function (k) { delete store[k]; }); if (cb) cb(); },
        },
      },
    };
  }

  beforeAll(function () {
    store = {};
    cacheMod = loadSource("newtab.js", {
      chrome: chromeWithStore(),
      browser: undefined,
      t: function (key) { return key; },
      document: {
        getElementById: function () {
          return { hidden: true, textContent: "", innerHTML: "", dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, querySelectorAll: function () { return []; }, setAttribute: function () {}, addEventListener: function () {} };
        },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        documentElement: { setAttribute: function () {} },
        createElement: function () { return {}; },
        title: "",
        activeElement: null,
      },
      fetchUsername: async function () { return "testuser"; },
      fetchDashboardData: async function () { return {}; },
      hasUnrespondedComments: function () { return false; },
      scorePr: function () { return { score: 0, reason: "" }; },
    });
  });

  it("returns null when nothing is cached", async function () {
    store = {};
    expect(await cacheMod.getCachedData()).toBe(null);
  });

  it("returns fresh data with its timestamp inside the TTL", async function () {
    var when = Date.now() - 60 * 1000;
    store = { dashboardCache: { username: "u" }, dashboardCacheTime: when };
    var cached = await cacheMod.getCachedData();
    expect(cached.fresh).toBe(true);
    expect(cached.time).toBe(when);
    expect(cached.data.username).toBe("u");
  });

  it("still returns stale data past the TTL, flagged as not fresh", async function () {
    var when = Date.now() - 11 * 60 * 1000;
    store = { dashboardCache: { username: "u" }, dashboardCacheTime: when };
    var cached = await cacheMod.getCachedData();
    expect(cached.fresh).toBe(false);
    expect(cached.time).toBe(when);
  });

  it("ignores a cache written by a different account", async function () {
    store = { dashboardCache: { username: "previous" }, dashboardCacheTime: Date.now(), githubUsername: "current" };
    expect(await cacheMod.getCachedData()).toBe(null);
  });

  it("accepts a cache whose owner matches the stored username", async function () {
    store = { dashboardCache: { username: "current" }, dashboardCacheTime: Date.now(), githubUsername: "current" };
    expect((await cacheMod.getCachedData()).data.username).toBe("current");
  });

  it("cacheData stores the fetch timestamp it is given", async function () {
    store = {};
    await cacheMod.cacheData({ username: "u" }, 12345);
    expect(store.dashboardCacheTime).toBe(12345);
  });
});

// --- Org filter pills ---

function fakePill(active) {
  var classes = active ? ["active"] : [];
  return {
    classList: {
      contains: function (c) { return classes.indexOf(c) !== -1; },
      toggle: function (c, force) {
        var has = classes.indexOf(c) !== -1;
        if (force === true && !has) classes.push(c);
        if (force === false && has) classes.splice(classes.indexOf(c), 1);
      },
    },
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = v; },
  };
}

describe("allPillsActive / setPillActive", function () {
  it("is true only when every pill is active", function () {
    expect(mod.allPillsActive([fakePill(true), fakePill(true)])).toBe(true);
    expect(mod.allPillsActive([fakePill(true), fakePill(false)])).toBe(false);
    expect(mod.allPillsActive([])).toBe(true);
  });

  it("setPillActive updates both the class and aria-pressed", function () {
    var pill = fakePill(false);
    mod.setPillActive(pill, true);
    expect(pill.classList.contains("active")).toBe(true);
    expect(pill.attrs["aria-pressed"]).toBe("true");
    mod.setPillActive(pill, false);
    expect(pill.classList.contains("active")).toBe(false);
    expect(pill.attrs["aria-pressed"]).toBe("false");
  });

  it("the All toggle rule: all on → off, otherwise → on", function () {
    // Mirrors the decision in renderOrgFilters: activate = !allPillsActive(orgPills)
    expect(!mod.allPillsActive([fakePill(true), fakePill(true)])).toBe(false);
    expect(!mod.allPillsActive([fakePill(true), fakePill(false)])).toBe(true);
    expect(!mod.allPillsActive([fakePill(false), fakePill(false)])).toBe(true);
  });
});

describe("renderScoredCard in the Review Requested column", function () {
  function reviewCard(extra, needsReview) {
    return mod.renderScoredCard(
      { pr: scoredPr("org", 1, extra), score: 0, reason: "", context: "review-requested", needsReview: needsReview },
      {}, {}
    );
  }

  it("highlights a PR that still needs a review", function () {
    var html = reviewCard({}, true);
    expect(html).toContain("status-badge needs-review");
    expect(html).toContain("statusNeedsYourReview");
    expect(html).not.toContain("settled");
  });

  it("dims a PR someone already approved", function () {
    var html = reviewCard({ reviewDecision: "APPROVED" }, false);
    expect(html).toContain("pr-card severity-low settled");
    expect(html).toContain("status-badge approved");
  });

  it("dims a PR you already reviewed even without an approval", function () {
    var html = reviewCard({}, false);
    expect(html).toContain(" settled");
    expect(html).toContain("status-badge review-required");
  });

  it("leaves drafts undimmed and never highlights them", function () {
    var html = reviewCard({ isDraft: true }, false);
    expect(html).not.toContain("settled");
    expect(html).toContain("status-badge draft");
  });

  it("does not touch cards in other columns", function () {
    var html = mod.renderScoredCard({ pr: scoredPr("org", 1), score: 0, reason: "", context: "authored", needsReview: false }, {}, {});
    expect(html).not.toContain("settled");
    expect(html).not.toContain("needs-review");
  });
});

describe("scoreAndSort carries needsReview", function () {
  it("copies the flag from scorePr onto the item", function () {
    var out = mod.scoreAndSort([scoredPr("org", 1, { needsReview: true }), scoredPr("org", 2)], "me", "review-requested", []);
    expect(out.map(function (i) { return i.needsReview; }).sort()).toEqual([false, true]);
  });
});

// --- Teammates merged into Review Requested ---

describe("mergeReviewRequested", function () {
  it("keeps the requested copy when a PR is in both lists", function () {
    var a = scoredPr("org", 1);
    var dup = scoredPr("org", 1);
    var out = mod.mergeReviewRequested([a], [dup, scoredPr("org", 2)], "me");
    expect(out.length).toBe(2);
    expect(out[0]).toBe(a);
    expect(out[0].source).toBe("requested");
    expect(out[1].source).toBe("teammates");
  });

  it("treats a teammate PR that names you in reviewRequests as requested", function () {
    var pr = scoredPr("org", 3, { reviewRequests: { nodes: [{ requestedReviewer: { login: "me" } }] } });
    var out = mod.mergeReviewRequested([], [pr], "me");
    expect(out[0].source).toBe("requested");
  });

  it("drops your own PRs even if they slipped into the teammate list", function () {
    var mine = scoredPr("org", 4, { author: { login: "Me", avatarUrl: "" } });
    expect(mod.mergeReviewRequested([], [mine], "me")).toEqual([]);
  });
});

describe("scoreAndSort tiers in Review Requested", function () {
  it("sorts by tier before org order, only in the review-requested column", function () {
    var orgConfig = [{ name: "first", color: "#111111" }, { name: "second", color: "#222222" }];
    var prs = [
      scoredPr("first", 5, { tier: 3 }),
      scoredPr("second", 50, { tier: 2 }),
      scoredPr("second", 10, { tier: 1 }),
      scoredPr("first", 1, { tier: 1 }),
    ];
    var review = mod.scoreAndSort(prs, "me", "review-requested", orgConfig);
    expect(review.map(function (i) { return i.tier + ":" + i.orgName + ":" + i.score; }))
      .toEqual(["1:first:1", "1:second:10", "2:second:50", "3:first:5"]);

    var authored = mod.scoreAndSort(prs, "me", "authored", orgConfig);
    expect(authored.map(function (i) { return i.orgName + ":" + i.score; }))
      .toEqual(["first:5", "first:1", "second:50", "second:10"]);
  });

  it("defaults tier to 3 when scorePr gives none", function () {
    var out = mod.scoreAndSort([scoredPr("org", 1)], "me", "review-requested", []);
    expect(out[0].tier).toBe(3);
  });
});

describe("renderScoredCard for teammates' PRs", function () {
  it("uses the team-review badge and carries data-tier", function () {
    var pr = scoredPr("org", 1, { source: "teammates" });
    var html = mod.renderScoredCard({ pr: pr, score: 15, reason: "", context: "review-requested", needsReview: true, tier: 2 }, {}, {});
    expect(html).toContain("status-badge team-review");
    expect(html).toContain("statusTeamReviewNeeded");
    expect(html).toContain('data-tier="2"');
    expect(html).not.toContain("settled");
  });

  it("dims a settled teammate PR", function () {
    var pr = scoredPr("org", 1, { source: "teammates", reviewDecision: "APPROVED" });
    var html = mod.renderScoredCard({ pr: pr, score: 0, reason: "", context: "review-requested", needsReview: false, tier: 3 }, {}, {});
    expect(html).toContain(" settled");
    expect(html).toContain('data-tier="3"');
  });
});

describe("tierLabel", function () {
  it("maps tiers to i18n keys", function () {
    expect(mod.tierLabel(1)).toBe("tierNeedsYou");
    expect(mod.tierLabel(2)).toBe("tierTeamNeeds");
    expect(mod.tierLabel(3)).toBe("tierSettled");
    expect(mod.tierLabel(undefined)).toBe("tierSettled");
  });
});

describe("collectTeammates", function () {
  var errorEl;
  var inputs;

  function fakeInput(value) {
    var classes = {};
    return {
      value: value,
      classList: { toggle: function (c, force) { classes[c] = !!force; }, contains: function (c) { return !!classes[c]; } },
    };
  }

  function loadWithRows(values) {
    inputs = values.map(fakeInput);
    errorEl = { hidden: true, textContent: "" };
    return loadSource("newtab.js", {
      chrome: { storage: { local: { get: function () {}, set: function () {}, remove: function () {} } } },
      browser: undefined,
      t: function (key, sub) { return sub ? key + ":" + sub : key; },
      isValidLogin: function (l) { return /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(l); },
      isDirectlyRequested: function () { return false; },
      fetchUsername: async function () { return "u"; },
      fetchDashboardData: async function () { return {}; },
      hasUnrespondedComments: function () { return false; },
      scorePr: function () { return { score: 0, reason: "", tier: 3 }; },
      document: {
        getElementById: function (id) {
          if (id === "teammate-list") return { querySelectorAll: function () { return inputs; } };
          if (id === "teammate-error") return errorEl;
          return { hidden: true, textContent: "", innerHTML: "", dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, querySelectorAll: function () { return []; }, setAttribute: function () {}, addEventListener: function () {} };
        },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        documentElement: { setAttribute: function () {} },
        createElement: function () { return {}; },
        title: "",
        activeElement: null,
      },
    });
  }

  it("normalises, dedupes and skips empty rows", function () {
    var m = loadWithRows([" Alice ", "bob", "", "alice"]);
    expect(m.collectTeammates()).toEqual(["alice", "bob"]);
    expect(errorEl.hidden).toBe(true);
  });

  it("returns null, marks the input and shows the hint for invalid logins", function () {
    var m = loadWithRows(["good-one", "bad name", "-lead"]);
    expect(m.collectTeammates()).toBe(null);
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe("teammateInvalid:bad name, -lead");
    expect(inputs[0].classList.contains("invalid")).toBe(false);
    expect(inputs[1].classList.contains("invalid")).toBe(true);
    expect(inputs[2].classList.contains("invalid")).toBe(true);
  });
});

describe("isFocusable (settings focus trap)", function () {
  function el(opts) {
    return Object.assign({ disabled: false, closest: function () { return null; } }, opts || {});
  }

  it("skips disabled elements and anything inside a hidden pane", function () {
    expect(mod.isFocusable(el())).toBe(true);
    expect(mod.isFocusable(el({ disabled: true }))).toBe(false);
    expect(mod.isFocusable(el({ closest: function (sel) { return sel === "[hidden]" ? {} : null; } }))).toBe(false);
    expect(mod.isFocusable(null)).toBe(false);
  });
});
