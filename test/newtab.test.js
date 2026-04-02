import { describe, it, expect, beforeAll } from "vitest";
import { loadSource } from "./helpers.js";

var mod;

beforeAll(function () {
  mod = loadSource("newtab.js", {
    // Stub browser globals that newtab.js needs at load time
    chrome: { storage: { local: { get: function () {}, set: function () {}, remove: function () {} } } },
    browser: undefined,
    api: { storage: { local: { get: function () {}, set: function () {}, remove: function () {} } } },
    isFirefox: false,
    document: {
      getElementById: function () {
        return { hidden: true, textContent: "", innerHTML: "", classList: { add: function () {}, remove: function () {}, toggle: function () {} }, querySelectorAll: function () { return []; }, setAttribute: function () {}, addEventListener: function () {} };
      },
      querySelector: function () { return null; },
      addEventListener: function () {},
      documentElement: { setAttribute: function () {} },
      createElement: function () {
        return {
          textContent: "",
          get innerHTML() {
            return this.textContent
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          },
        };
      },
    },
    // Stub globals from other scripts loaded before newtab.js
    fetchUsername: async function () { return "testuser"; },
    fetchDashboardData: async function () { return {}; },
    assignZones: function () { return { actNow: [], radar: [], clear: [] }; },
    ciStatus: function () { return "unknown"; },
    hasUnrespondedComments: function () { return false; },
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

describe("parseOrgList", function () {
  it("splits comma-separated orgs", function () {
    expect(mod.parseOrgList("foo, bar, baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("lowercases and trims", function () {
    expect(mod.parseOrgList(" MyOrg , OtherOrg ")).toEqual(["myorg", "otherorg"]);
  });

  it("filters invalid org names", function () {
    expect(mod.parseOrgList("valid-org, in valid, --bad")).toEqual(["valid-org"]);
  });

  it("returns empty array for null/empty input", function () {
    expect(mod.parseOrgList(null)).toEqual([]);
    expect(mod.parseOrgList("")).toEqual([]);
  });
});

describe("timeAgo", function () {
  it("returns 'just now' for recent dates", function () {
    expect(mod.timeAgo(new Date().toISOString())).toBe("just now");
  });

  it("returns minutes ago", function () {
    var fiveMin = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(mod.timeAgo(fiveMin)).toBe("5m ago");
  });

  it("returns hours ago", function () {
    var threeHours = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(mod.timeAgo(threeHours)).toBe("3h ago");
  });

  it("returns days ago", function () {
    var twoDays = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    expect(mod.timeAgo(twoDays)).toBe("2d ago");
  });

  it("returns 'unknown' for invalid dates", function () {
    expect(mod.timeAgo("not-a-date")).toBe("unknown");
  });
});

describe("friendlyError", function () {
  it("detects 502 errors", function () {
    var msg = mod.friendlyError(new Error("GitHub API 502"));
    expect(msg).toContain("GitHub is having issues");
  });

  it("detects 429 rate limit", function () {
    var msg = mod.friendlyError(new Error("429 after 3 attempts"));
    expect(msg).toContain("rate limit");
  });

  it("detects 401 auth errors", function () {
    var msg = mod.friendlyError(new Error("GitHub API 401"));
    expect(msg).toContain("token");
  });

  it("detects network errors", function () {
    var msg = mod.friendlyError(new Error("Failed to fetch"));
    expect(msg).toContain("internet connection");
  });

  it("returns generic message for unknown errors", function () {
    var msg = mod.friendlyError(new Error("something weird"));
    expect(msg).toContain("Something went wrong");
  });
});
