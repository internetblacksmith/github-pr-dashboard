/**
 * GitHub GraphQL API client.
 *
 * Fetches four categories of PRs in up to three parallel requests:
 * 1. PRs assigned to the user for review
 * 2. User's own PRs (with review thread data for "needs response" detection)
 *    Only the fields the scorer reads — unused fields cost rate-limit points
 * 3. All open PRs in the user's personal repos/orgs
 * 4. Open PRs authored by configured teammates (skipped when none configured)
 *
 * Split into separate queries to avoid GitHub 502 timeouts on complex requests.
 */

// i18n helper — available to all scripts loaded after github.js
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

var GITHUB_GRAPHQL = "https://api.github.com/graphql";

// GitHub login rules: 1-39 chars, alphanumeric or hyphen, no leading/trailing hyphen
var GITHUB_LOGIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
// GitHub caps a search string at 256 characters. Teammate queries are packed
// greedily: as many `author:` qualifiers as fit next to the `org:` qualifiers.
var SEARCH_MAX_LEN = 256;

function isValidLogin(login) {
  return typeof login === "string" && GITHUB_LOGIN_RE.test(login);
}
var MAX_RETRIES = 3;
var RETRY_CODES = [502, 503, 504, 429];
var FETCH_TIMEOUT_MS = 30000;

var PR_FRAGMENT = [
  "title",
  "url",
  "number",
  "createdAt",
  "updatedAt",
  "isDraft",
  "repository { nameWithOwner }",
  "author { login avatarUrl }",
  "reviewDecision",
  "additions",
  "deletions",
].join(" ");


// Authored PRs: review threads drive the "unresponded feedback" signal.
var AUTHORED_EXTRA = [
  "reviewThreads(first: 50) { nodes { isResolved comments(last: 1) { nodes { author { login } } } } }",
].join(" ");

// Review-requested PRs: prior reviews + outstanding requests drive the
// "pending review" signal (see isReviewPending in score.js).
var REVIEW_REQUESTED_EXTRA = [
  "reviews(first: 20) { nodes { author { login } state } }",
  "reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }",
].join(" ");

async function graphql(token, query, variables) {
  variables = variables || {};
  var lastError;

  for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff; for 429 respect a longer pause
      var delay = lastError && lastError.indexOf("429") !== -1 ? 5000 * attempt : 1000 * attempt;
      await new Promise(function (r) { setTimeout(r, delay); });
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

    try {
      var response = await fetch(GITHUB_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: "bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: query, variables: variables }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        var json = await response.json();
        if (json.errors) {
          throw new Error("GraphQL errors: " + JSON.stringify(json.errors));
        }
        return json.data;
      }

      lastError = "GitHub API " + response.status;
      if (RETRY_CODES.indexOf(response.status) === -1) {
        var text = await response.text();
        throw new Error(lastError + ": " + text);
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        lastError = "Request timed out";
        continue;
      }
      throw err;
    }
  }

  throw new Error(lastError + " after " + MAX_RETRIES + " attempts");
}

async function fetchUsername(token) {
  var data = await graphql(token, "query { viewer { login } }");
  return data.viewer.login;
}

/**
 * @param {string} token
 * @param {{ personalOrgs?: string[], teammates?: string[], teammateOrgs?: string[] }} config
 * @param {function} [onStatus] progress messages for the loading screen
 */
async function fetchDashboardData(token, config, onStatus) {
  config = config || {};
  var personalOrgs = config.personalOrgs || [];
  var teammates = config.teammates || [];
  var teammateOrgs = config.teammateOrgs || [];
  var status = onStatus || function () {};

  status(t("statusConnecting"));
  var username = await fetchUsername(token);

  status(t("statusFetching", username));
  var corePromise = fetchCoreData(token, username);

  status(t("statusScanning"));
  var personalPromise = fetchPersonalPrs(token, username, personalOrgs);
  var teammatesPromise = fetchTeammatePrs(token, username, teammates, teammateOrgs);

  var results = await Promise.all([corePromise, personalPromise, teammatesPromise]);
  var coreData = results[0];
  var personalPrs = results[1];
  var teammatePrs = results[2];

  status(t("statusProcessing"));

  // GraphQL search returns Issue and PullRequest nodes; filter to PRs only
  var authored = coreData.authored.nodes.filter(function (pr) { return pr.title; });
  var reviewRequested = coreData.reviewRequested.nodes.filter(function (pr) { return pr.title; });
  return {
    username: username,
    reviewRequested: reviewRequested,
    authored: authored,
    personalPrs: personalPrs,
    teammatePrs: teammatePrs,
  };
}

function fetchCoreData(token, username) {
  var query = "query CoreData($reviewQuery: String!, $authorQuery: String!) {"
    + " reviewRequested: search(query: $reviewQuery, type: ISSUE, first: 50) {"
    + "   nodes { ... on PullRequest { " + PR_FRAGMENT + " " + REVIEW_REQUESTED_EXTRA + " } }"
    + " }"
    + " authored: search(query: $authorQuery, type: ISSUE, first: 50) {"
    + "   nodes { ... on PullRequest { " + PR_FRAGMENT + " " + AUTHORED_EXTRA + " } }"
    + " }"
    + "}";

  return graphql(token, query, {
    reviewQuery: "is:open is:pr review-requested:" + username + " archived:false",
    authorQuery: "is:open is:pr author:" + username + " archived:false",
  });
}

function fetchPersonalPrs(token, username, personalOrgs) {
  var usernameLower = username.toLowerCase();
  var allOwners = [usernameLower];
  personalOrgs.forEach(function (o) {
    if (o !== usernameLower) allOwners.push(o);
  });

  var aliasParts = [];
  var varDeclParts = [];
  var variables = {};

  allOwners.forEach(function (owner, i) {
    varDeclParts.push("$q" + i + ": String!");
    aliasParts.push(
      "personal" + i + ": search(query: $q" + i + ", type: ISSUE, first: 50) {"
      + " nodes { ... on PullRequest { " + PR_FRAGMENT + " } }"
      + "}"
    );
    var qualifier = (owner === usernameLower) ? "user" : "org";
    variables["q" + i] = "is:open is:pr " + qualifier + ":" + owner + " archived:false";
  });

  var query = "query PersonalPrs(" + varDeclParts.join(", ") + ") { " + aliasParts.join(" ") + " }";

  return graphql(token, query, variables).then(function (data) {
    var seen = {};
    var results = [];
    for (var i = 0; i < allOwners.length; i++) {
      var nodes = (data["personal" + i] && data["personal" + i].nodes) || [];
      for (var j = 0; j < nodes.length; j++) {
        var pr = nodes[j];
        if (pr.title && !seen[pr.url]) {
          seen[pr.url] = true;
          results.push(pr);
        }
      }
    }
    return results;
  });
}

// Normalise a list of GitHub names (logins or org names share the same rules):
// trim, lowercase, drop invalid, drop duplicates and any excluded value.
function cleanNames(list, exclude) {
  var out = [];
  var seen = {};
  (list || []).forEach(function (raw) {
    var name = String(raw).trim().toLowerCase();
    if (name && name !== exclude && isValidLogin(name) && !seen[name]) {
      seen[name] = true;
      out.push(name);
    }
  });
  return out;
}

/**
 * Split `names` into the fewest groups such that
 * `prefix + qualifier:name ...` stays under SEARCH_MAX_LEN. `reserve` is
 * extra room the caller needs in the same string (e.g. for one author).
 */
function chunkQualifiers(names, qualifier, prefixLen, reserve) {
  var chunks = [];
  var current = [];
  var len = prefixLen;
  names.forEach(function (name) {
    var extra = qualifier.length + 1 + name.length + 1; // "qualifier:name "
    if (current.length > 0 && len + extra + reserve > SEARCH_MAX_LEN) {
      chunks.push(current);
      current = [];
      len = prefixLen;
    }
    current.push(name);
    len += extra;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Open PRs authored by configured teammates (company teammates, not a GitHub
 * team), optionally limited to a set of organisations. Repeated `author:` (and
 * `org:`) qualifiers OR together in GitHub search, so one search covers a group
 * of logins in a group of orgs; every group becomes an alias in one request.
 * The user's own login is dropped here; that is the only self-exclusion.
 */
function fetchTeammatePrs(token, username, teammates, teammateOrgs) {
  var logins = cleanNames(teammates, username.toLowerCase());
  var orgs = cleanNames(teammateOrgs, null);
  if (logins.length === 0) return Promise.resolve([]);

  var base = "is:open is:pr ";
  var suffix = " archived:false";
  var longestAuthor = logins.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  var authorReserve = "author:".length + longestAuthor + 1;

  // Org groups first (each must leave room for at least one author), then
  // author groups packed into whatever room each org group leaves.
  var orgGroups = orgs.length > 0 ? chunkQualifiers(orgs, "org", base.length + suffix.length, authorReserve) : [[]];
  var searches = [];
  orgGroups.forEach(function (orgGroup) {
    var orgPart = orgGroup.map(function (o) { return "org:" + o + " "; }).join("");
    var prefixLen = base.length + orgPart.length + suffix.length;
    chunkQualifiers(logins, "author", prefixLen, 0).forEach(function (authorGroup) {
      searches.push(base + orgPart + authorGroup.map(function (l) { return "author:" + l; }).join(" ") + suffix);
    });
  });

  var aliasParts = [];
  var varDeclParts = [];
  var variables = {};
  searches.forEach(function (search, i) {
    varDeclParts.push("$t" + i + ": String!");
    aliasParts.push(
      "teammates" + i + ": search(query: $t" + i + ", type: ISSUE, first: 50) {"
      + " nodes { ... on PullRequest { " + PR_FRAGMENT + " " + REVIEW_REQUESTED_EXTRA + " } }"
      + "}"
    );
    variables["t" + i] = search;
  });
  var query = "query TeammatePrs(" + varDeclParts.join(", ") + ") { " + aliasParts.join(" ") + " }";

  var orgSet = {};
  orgs.forEach(function (o) { orgSet[o] = true; });

  return graphql(token, query, variables).then(function (data) {
    var seen = {};
    var results = [];
    for (var c = 0; c < searches.length; c++) {
      var nodes = (data["teammates" + c] && data["teammates" + c].nodes) || [];
      for (var j = 0; j < nodes.length; j++) {
        var pr = nodes[j];
        if (!pr.title || seen[pr.url]) continue;
        // Belt and braces: the org filter is also applied to what comes back
        if (orgs.length > 0) {
          var owner = ((pr.repository && pr.repository.nameWithOwner) || "").split("/")[0].toLowerCase();
          if (!orgSet[owner]) continue;
        }
        seen[pr.url] = true;
        results.push(pr);
      }
    }
    return results;
  });
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

