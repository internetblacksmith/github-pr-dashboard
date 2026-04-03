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
    scorePr: function () { return { score: 0, reason: "" }; },
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

  it("allows http URLs", function () {
    expect(mod.isSafeUrl("http://example.com")).toBe(true);
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
