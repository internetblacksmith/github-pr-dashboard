/**
 * Demo drop-in replacement for github.js.
 *
 * Same public API (t, fetchUsername, fetchDashboardData, hasUnrespondedComments)
 * but returns hardcoded data instead of calling the GitHub API.
 *
 * Used by `make demo` to produce a screenshot-ready extension build
 * with realistic fake PR data — no token, no network, no real repos.
 */

// i18n helper — same as production github.js
var t = (function () {
  var i18nApi = (typeof browser !== "undefined" && browser.i18n) ? browser.i18n
    : (typeof chrome !== "undefined" && chrome.i18n) ? chrome.i18n
    : null;
  return function (key) {
    if (!i18nApi) return key;
    var subs = [];
    for (var i = 1; i < arguments.length; i++) subs.push(String(arguments[i]));
    return i18nApi.getMessage(key, subs) || key;
  };
})();

var DEMO_USERNAME = "demouser";

function makeDemoPr(org, repo, number, title, author, hoursAgo, isDraft, reviewDecision, additions, deletions, threads) {
  var now = Date.now();
  return {
    title: title,
    url: "https://github.com/" + org + "/" + repo + "/pull/" + number,
    number: number,
    createdAt: new Date(now - (hoursAgo + 24) * 3600000).toISOString(),
    updatedAt: new Date(now - hoursAgo * 3600000).toISOString(),
    isDraft: isDraft,
    repository: { nameWithOwner: org + "/" + repo },
    author: {
      login: author,
      avatarUrl: "https://ui-avatars.com/api/?name=" + author + "&background=random&size=56",
    },
    reviewDecision: reviewDecision,
    additions: additions,
    deletions: deletions,
    reviews: { nodes: author === DEMO_USERNAME ? [] : [{ author: { login: DEMO_USERNAME } }] },
    reviewThreads: { nodes: threads },
  };
}

var DEMO_DATA = {
  username: DEMO_USERNAME,
  reviewRequested: [
    makeDemoPr("acme-corp", "api-gateway", 342, "Add rate limiting middleware", "alice", 2, false, null, 45, 12, []),
    makeDemoPr("acme-corp", "web-app", 189, "Migrate auth to OAuth 2.1", "bob", 48, false, null, 312, 87, []),
    makeDemoPr("acme-corp", "api-gateway", 340, "Fix connection pool exhaustion under load", "charlie", 6, false, null, 28, 9, []),
    makeDemoPr("opensource-tools", "cli-framework", 78, "Add shell completion for zsh", "diana", 72, false, null, 156, 23, []),
  ],
  authored: [
    makeDemoPr("acme-corp", "web-app", 195, "Refactor dashboard state management", DEMO_USERNAME, 24, false, "CHANGES_REQUESTED", 89, 34,
      [{ isResolved: false, comments: { nodes: [{ author: { login: "alice" } }] } }]),
    makeDemoPr("acme-corp", "api-gateway", 338, "Update TLS certificate rotation", DEMO_USERNAME, 4, false, "APPROVED", 12, 5, []),
    makeDemoPr("opensource-tools", "cli-framework", 76, "Add JSON output format for all commands", DEMO_USERNAME, 96, false, null, 234, 45,
      [{ isResolved: false, comments: { nodes: [{ author: { login: "eve" } }] } }]),
    makeDemoPr("acme-corp", "web-app", 197, "WIP: Dark mode support", DEMO_USERNAME, 1, true, null, 567, 123, []),
  ],
  personalPrs: [
    makeDemoPr("demouser", "dotfiles", 12, "Update neovim config for v0.10", DEMO_USERNAME, 168, false, null, 45, 12, []),
    makeDemoPr("demouser", "blog", 8, "Add RSS feed generation", DEMO_USERNAME, 48, false, "APPROVED", 89, 3, []),
    makeDemoPr("side-project-org", "weather-app", 34, "Fix timezone handling in forecast API", "frank", 24, false, null, 23, 8, []),
    makeDemoPr("side-project-org", "weather-app", 31, "Add 7-day forecast widget", DEMO_USERNAME, 72, false, null, 145, 22, []),
  ],
};

async function fetchUsername() {
  return DEMO_USERNAME;
}

async function fetchDashboardData(token, personalOrgs, onStatus) {
  var status = onStatus || function () {};

  // Simulate the real loading sequence so status messages appear briefly
  status(t("statusConnecting"));
  await new Promise(function (r) { setTimeout(r, 150); });

  status(t("statusFetching", DEMO_USERNAME));
  await new Promise(function (r) { setTimeout(r, 200); });

  status(t("statusScanning"));
  await new Promise(function (r) { setTimeout(r, 150); });

  status(t("statusProcessing"));
  await new Promise(function (r) { setTimeout(r, 100); });

  return DEMO_DATA;
}

function hasUnrespondedComments(pr, username) {
  var threads = (pr.reviewThreads && pr.reviewThreads.nodes) || [];
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    if (thread.isResolved) continue;

    var comments = (thread.comments && thread.comments.nodes) || [];
    if (comments.length === 0) continue;

    var lastComment = comments[comments.length - 1];
    if (!lastComment.author || lastComment.author.login !== username) {
      return true;
    }
  }
  return false;
}
