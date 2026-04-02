/**
 * GitHub GraphQL API client.
 *
 * Fetches four categories of PRs in two parallel requests:
 * 1. PRs assigned to the user for review
 * 2. User's own PRs (with review thread data for "needs response" detection)
 * 3. All open PRs in the user's personal repos/orgs
 *
 * Split into two queries to avoid GitHub 502 timeouts on complex requests.
 */

var GITHUB_GRAPHQL = "https://api.github.com/graphql";
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


var AUTHORED_EXTRA = [
  "mergeable",
  "reviews(last: 20) { nodes { author { login } state submittedAt } }",
  "reviewThreads(first: 50) { nodes { isResolved comments(last: 1) { nodes { author { login } } } } }",
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

async function fetchDashboardData(token, personalOrgs, onStatus) {
  personalOrgs = personalOrgs || [];
  var status = onStatus || function () {};

  status("Connecting to GitHub...");
  var username = await fetchUsername(token);

  status("Fetching reviews & PRs for @" + username + "...");
  var corePromise = fetchCoreData(token, username);

  status("Scanning personal projects...");
  var personalPromise = fetchPersonalPrs(token, username, personalOrgs);

  var results = await Promise.all([corePromise, personalPromise]);
  var coreData = results[0];
  var personalPrs = results[1];

  status("Crunching the numbers...");

  // GraphQL search returns Issue and PullRequest nodes; filter to PRs only
  var authored = coreData.authored.nodes.filter(function (pr) { return pr.title; });
  var reviewRequested = coreData.reviewRequested.nodes.filter(function (pr) { return pr.title; });
  var needsResponse = authored.filter(function (pr) { return hasUnrespondedComments(pr, username); });

  return { username: username, reviewRequested: reviewRequested, authored: authored, needsResponse: needsResponse, personalPrs: personalPrs };
}

function fetchCoreData(token, username) {
  var query = "query CoreData($reviewQuery: String!, $authorQuery: String!) {"
    + " reviewRequested: search(query: $reviewQuery, type: ISSUE, first: 50) {"
    + "   nodes { ... on PullRequest { " + PR_FRAGMENT + " reviews(first: 20) { nodes { author { login } } } } }"
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

function ciStatus(pr) {
  var commits = pr.commits && pr.commits.nodes;
  var rollup = commits && commits[0] && commits[0].commit && commits[0].commit.statusCheckRollup;
  if (!rollup) return "unknown";
  return rollup.state.toLowerCase();
}
