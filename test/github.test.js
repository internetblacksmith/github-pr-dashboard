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


// --- graphql() network behaviour ---
//
// setTimeout is stubbed to fire immediately so retry backoff doesn't slow
// tests down. The fetch stub decides whether the "request" is aborted.

function loadGithubWith(fetchStub) {
  return loadSource("github.js", {
    fetch: fetchStub,
    setTimeout: function (fn) { fn(); return 0; },
    clearTimeout: function () {},
  });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return body; },
    text: async function () { return JSON.stringify(body); },
  };
}

describe("graphql", function () {
  it("sends the token as a bearer header and returns data", async function () {
    var seen;
    var mod = loadGithubWith(async function (url, opts) {
      seen = { url: url, opts: opts };
      return jsonResponse(200, { data: { viewer: { login: "me" } } });
    });
    var login = await mod.fetchUsername("tok");
    expect(login).toBe("me");
    expect(seen.url).toBe("https://api.github.com/graphql");
    expect(seen.opts.headers.Authorization).toBe("bearer tok");
    expect(seen.opts.method).toBe("POST");
  });

  it("retries on 502 and succeeds", async function () {
    var calls = 0;
    var mod = loadGithubWith(async function () {
      calls++;
      if (calls < 3) return jsonResponse(502, "bad gateway");
      return jsonResponse(200, { data: { viewer: { login: "me" } } });
    });
    expect(await mod.fetchUsername("tok")).toBe("me");
    expect(calls).toBe(3);
  });

  it("gives up after MAX_RETRIES retryable failures", async function () {
    var calls = 0;
    var mod = loadGithubWith(async function () { calls++; return jsonResponse(503, "down"); });
    await expect(mod.fetchUsername("tok")).rejects.toThrow(/503 after 3 attempts/);
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable statuses and includes the body", async function () {
    var calls = 0;
    var mod = loadGithubWith(async function () { calls++; return jsonResponse(401, { message: "Bad credentials" }); });
    await expect(mod.fetchUsername("tok")).rejects.toThrow(/401.*Bad credentials/);
    expect(calls).toBe(1);
  });

  it("retries when the request times out", async function () {
    var calls = 0;
    var mod = loadGithubWith(async function (url, opts) {
      calls++;
      // setTimeout fired immediately, so the abort already happened
      if (opts.signal.aborted) {
        var err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return jsonResponse(200, { data: {} });
    });
    await expect(mod.fetchUsername("tok")).rejects.toThrow(/timed out after 3 attempts/);
    expect(calls).toBe(3);
  });

  it("throws on GraphQL-level errors even with a 200", async function () {
    var mod = loadGithubWith(async function () {
      return jsonResponse(200, { data: null, errors: [{ type: "INSUFFICIENT_SCOPES", message: "nope" }] });
    });
    await expect(mod.fetchUsername("tok")).rejects.toThrow(/INSUFFICIENT_SCOPES/);
  });
});

describe("fetchCoreData", function () {
  it("requests only the fields the scorer uses", async function () {
    var body;
    var mod = loadGithubWith(async function (url, opts) {
      body = JSON.parse(opts.body);
      return jsonResponse(200, { data: { reviewRequested: { nodes: [] }, authored: { nodes: [] } } });
    });
    await mod.fetchCoreData("tok", "me");
    expect(body.query).toContain("reviewRequests(first: 20)");
    expect(body.query).toContain("reviewThreads(first: 50)");
    expect(body.query).not.toContain("mergeable");
    expect(body.query).not.toContain("submittedAt");
    expect(body.variables.reviewQuery).toBe("is:open is:pr review-requested:me archived:false");
    expect(body.variables.authorQuery).toBe("is:open is:pr author:me archived:false");
  });
});

describe("fetchPersonalPrs", function () {
  function personalStub(data, capture) {
    return loadGithubWith(async function (url, opts) {
      if (capture) capture.body = JSON.parse(opts.body);
      return jsonResponse(200, { data: data });
    });
  }

  it("uses user: for the account and org: for extra orgs, lowercased", async function () {
    var capture = {};
    var mod = personalStub({ personal0: { nodes: [] }, personal1: { nodes: [] } }, capture);
    await mod.fetchPersonalPrs("tok", "MyName", ["some-org"]);
    expect(capture.body.variables.q0).toBe("is:open is:pr user:myname archived:false");
    expect(capture.body.variables.q1).toBe("is:open is:pr org:some-org archived:false");
  });

  it("does not query the user's own login twice when it is also in the org list", async function () {
    var capture = {};
    var mod = personalStub({ personal0: { nodes: [] } }, capture);
    await mod.fetchPersonalPrs("tok", "me", ["me", "other"]);
    expect(Object.keys(capture.body.variables)).toEqual(["q0", "q1"]);
    expect(capture.body.variables.q1).toContain("org:other");
  });

  it("deduplicates PRs by URL across queries and drops non-PR nodes", async function () {
    var pr = { title: "A", url: "https://github.com/me/r/pull/1" };
    var mod = personalStub({
      personal0: { nodes: [pr, {}] },
      personal1: { nodes: [{ title: "A again", url: pr.url }, { title: "B", url: "https://github.com/o/r/pull/2" }] },
    });
    var result = await mod.fetchPersonalPrs("tok", "me", ["o"]);
    expect(result.map(function (p) { return p.title; })).toEqual(["A", "B"]);
  });

  it("tolerates a missing alias in the response", async function () {
    var mod = personalStub({ personal0: { nodes: [{ title: "A", url: "u" }] } });
    var result = await mod.fetchPersonalPrs("tok", "me", ["o"]);
    expect(result.length).toBe(1);
  });
});

describe("fetchTeammatePrs", function () {
  function teammateStub(data, capture) {
    return loadGithubWith(async function (url, opts) {
      if (capture) { capture.calls = (capture.calls || 0) + 1; capture.body = JSON.parse(opts.body); }
      return jsonResponse(200, { data: data });
    });
  }

  it("packs logins into one search when they fit, with OR-ed author qualifiers", async function () {
    var capture = {};
    var mod = teammateStub({ teammates0: { nodes: [] } }, capture);
    await mod.fetchTeammatePrs("tok", "me", ["a", "b", "c", "d", "e"]);
    expect(capture.body.query).toContain("teammates0: search(query: $t0");
    expect(capture.body.query).not.toContain("teammates1");
    expect(capture.body.query).toContain("reviewRequests(first: 20)");
    expect(capture.body.variables.t0).toBe("is:open is:pr author:a author:b author:c author:d author:e archived:false");
  });

  it("adds org qualifiers and filters results to those orgs", async function () {
    var capture = {};
    var inOrg = { title: "In", url: "u1", repository: { nameWithOwner: "Acme/repo" } };
    var outOfOrg = { title: "Out", url: "u2", repository: { nameWithOwner: "hobby/repo" } };
    var mod = teammateStub({ teammates0: { nodes: [inOrg, outOfOrg] } }, capture);
    var out = await mod.fetchTeammatePrs("tok", "me", ["a", "b"], ["ACME", "beta-org", "acme", "bad org"]);
    expect(capture.body.variables.t0).toBe("is:open is:pr org:acme org:beta-org author:a author:b archived:false");
    expect(out.map(function (p) { return p.title; })).toEqual(["In"]);
  });

  it("splits into several searches so each stays under 256 chars", async function () {
    var capture = {};
    var data = {};
    for (var i = 0; i < 10; i++) data["teammates" + i] = { nodes: [] };
    var mod = teammateStub(data, capture);
    var long = function (c) { return c.repeat(39); };
    var logins = ["a", "b", "c", "d", "e", "f", "g"].map(long);
    var orgs = ["x", "y", "z"].map(long);
    await mod.fetchTeammatePrs("tok", "me", logins, orgs);
    var vars = Object.keys(capture.body.variables).map(function (k) { return capture.body.variables[k]; });
    expect(vars.length).toBeGreaterThan(1);
    vars.forEach(function (v) {
      expect(v.length).toBeLessThanOrEqual(256);
      expect(v).toMatch(/^is:open is:pr (org:[a-z]+ )+(author:[a-z]+ ?)+ archived:false$/);
    });
    // every login appears with every org group
    var joined = vars.join("\n");
    logins.forEach(function (l) { expect(joined).toContain("author:" + l); });
    orgs.forEach(function (o) { expect(joined).toContain("org:" + o); });
  });

  it("drops your own login, invalid logins and duplicates before querying", async function () {
    var capture = {};
    var mod = teammateStub({ teammates0: { nodes: [] } }, capture);
    await mod.fetchTeammatePrs("tok", "Me", ["me", "  Alice ", "bad name", "-x", "alice", "bob"]);
    expect(capture.body.variables.t0).toBe("is:open is:pr author:alice author:bob archived:false");
  });

  it("does not call the API when no valid teammates remain", async function () {
    var capture = {};
    var mod = teammateStub({}, capture);
    expect(await mod.fetchTeammatePrs("tok", "me", ["me", ""])).toEqual([]);
    expect(capture.calls).toBeUndefined();
  });

  it("deduplicates by URL across searches and skips non-PR nodes", async function () {
    var pr = { title: "A", url: "https://github.com/o/r/pull/1" };
    var mod = teammateStub({
      teammates0: { nodes: [pr, {}] },
      teammates1: { nodes: [{ title: "A again", url: pr.url }, { title: "B", url: "https://github.com/o/r/pull/2" }] },
    });
    var long = function (c) { return c.repeat(39); };
    var out = await mod.fetchTeammatePrs("tok", "me", ["a", "b", "c", "d", "e", "f"].map(long));
    expect(out.map(function (p) { return p.title; })).toEqual(["A", "B"]);
  });

  it("keeps worst-case logins under GitHub's 256-char search limit", async function () {
    var capture = {};
    var mod = teammateStub({ teammates0: { nodes: [] }, teammates1: { nodes: [] } }, capture);
    var long = "a".repeat(39);
    await mod.fetchTeammatePrs("tok", "me", [long, long.replace(/a$/, "b"), long.replace(/a$/, "c"), long.replace(/a$/, "d"), long.replace(/a$/, "e")]);
    Object.keys(capture.body.variables).forEach(function (k) {
      expect(capture.body.variables[k].length).toBeLessThanOrEqual(256);
    });
  });
});

describe("fetchDashboardData", function () {
  it("runs core, personal and teammate queries and returns all five lists", async function () {
    var queries = [];
    var mod = loadGithubWith(async function (url, opts) {
      var body = JSON.parse(opts.body);
      queries.push(body.query.split("(")[0].split("{")[0].trim());
      if (body.query.indexOf("query { viewer") === 0) return jsonResponse(200, { data: { viewer: { login: "me" } } });
      if (body.query.indexOf("CoreData") !== -1) return jsonResponse(200, { data: { reviewRequested: { nodes: [{ title: "R", url: "r" }] }, authored: { nodes: [{ title: "A", url: "a" }, {}] } } });
      if (body.query.indexOf("PersonalPrs") !== -1) return jsonResponse(200, { data: { personal0: { nodes: [{ title: "P", url: "p" }] } } });
      if (body.query.indexOf("TeammatePrs") !== -1) return jsonResponse(200, { data: { teammates0: { nodes: [{ title: "T", url: "t" }] } } });
      throw new Error("unexpected query");
    });
    var statuses = [];
    var data = await mod.fetchDashboardData("tok", { personalOrgs: [], teammates: ["pal"] }, function (s) { statuses.push(s); });
    expect(data.username).toBe("me");
    expect(data.reviewRequested.map(function (p) { return p.title; })).toEqual(["R"]);
    expect(data.authored.map(function (p) { return p.title; })).toEqual(["A"]);
    expect(data.personalPrs.map(function (p) { return p.title; })).toEqual(["P"]);
    expect(data.teammatePrs.map(function (p) { return p.title; })).toEqual(["T"]);
    expect(queries).toContain("query TeammatePrs");
    expect(statuses[0]).toBe("statusConnecting");
  });

  it("skips the teammate query when the list is empty", async function () {
    var teammateCalls = 0;
    var mod = loadGithubWith(async function (url, opts) {
      var body = JSON.parse(opts.body);
      if (body.query.indexOf("TeammatePrs") !== -1) teammateCalls++;
      if (body.query.indexOf("query { viewer") === 0) return jsonResponse(200, { data: { viewer: { login: "me" } } });
      if (body.query.indexOf("CoreData") !== -1) return jsonResponse(200, { data: { reviewRequested: { nodes: [] }, authored: { nodes: [] } } });
      return jsonResponse(200, { data: { personal0: { nodes: [] } } });
    });
    var data = await mod.fetchDashboardData("tok", { personalOrgs: [], teammates: [] }, null);
    expect(teammateCalls).toBe(0);
    expect(data.teammatePrs).toEqual([]);
  });
});

describe("isValidLogin", function () {
  it("accepts GitHub-shaped logins and rejects the rest", function () {
    var mod = loadGithubWith(async function () {});
    expect(mod.isValidLogin("octocat")).toBe(true);
    expect(mod.isValidLogin("octo-cat-42")).toBe(true);
    expect(mod.isValidLogin("a")).toBe(true);
    expect(mod.isValidLogin("a".repeat(39))).toBe(true);
    expect(mod.isValidLogin("a".repeat(40))).toBe(false);
    expect(mod.isValidLogin("-lead")).toBe(false);
    expect(mod.isValidLogin("trail-")).toBe(false);
    expect(mod.isValidLogin("has space")).toBe(false);
    expect(mod.isValidLogin("a OR b")).toBe(false);
    expect(mod.isValidLogin("")).toBe(false);
    expect(mod.isValidLogin(null)).toBe(false);
  });
});
