/**
 * New tab page controller.
 *
 * Flow:
 * 1. Check if token exists in storage
 *    - No  -> show setup screen
 *    - Yes -> fetch data and render dashboard
 *
 * PRs are grouped by Work / Personal based on user-configured org names.
 * A "Personal Projects" column shows all open PRs in the user's repos
 * and any additional personal orgs, grouped by org/owner.
 *
 * Works on both Chrome (chrome.*) and Firefox (browser.*).
 */

// Prefer Firefox's promise-based browser.* API, fall back to Chrome's.
var isFirefox = (typeof browser !== "undefined");
var api = isFirefox ? browser : chrome;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// DOM references
const setupScreen = document.getElementById("setup-screen");
const dashboard = document.getElementById("dashboard");
const loading = document.getElementById("loading");
const errorBanner = document.getElementById("error-banner");
const settingsModal = document.getElementById("settings-modal");

async function init() {
  try {
    await applyTheme();

    const token = await getStored("githubToken");

    if (!token) {
      showScreen(setupScreen);
      setupSetupForm();
      return;
    }

    showScreen(dashboard);
    setupHeaderButtons(token);
    await loadDashboard(token);
  } catch (err) {
    console.error("Init failed:", err);
  }
}

function showScreen(screen) {
  setupScreen.hidden = true;
  dashboard.hidden = true;
  screen.hidden = false;
}

// --- Storage helpers ---
// Firefox's browser.* returns promises natively.
// Chrome's chrome.* uses callbacks and returns undefined.

function storageGet(key) {
  if (isFirefox) {
    return api.storage.local.get(key);
  }
  return new Promise(function (resolve) {
    api.storage.local.get(key, resolve);
  });
}

function storageSet(data) {
  if (isFirefox) {
    return api.storage.local.set(data);
  }
  return new Promise(function (resolve) {
    api.storage.local.set(data, resolve);
  });
}

function storageRemove(keys) {
  if (isFirefox) {
    return api.storage.local.remove(keys);
  }
  return new Promise(function (resolve) {
    api.storage.local.remove(keys, resolve);
  });
}

function getStored(key) {
  return storageGet(key).then(function (result) {
    return result[key] ?? null;
  });
}

function setStored(data) {
  return storageSet(data);
}

function removeStored(keys) {
  return storageRemove(keys);
}

var ORG_NAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

function parseOrgList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s && ORG_NAME_RE.test(s); });
}

// --- Theme ---

async function applyTheme() {
  var theme = (await getStored("theme")) || "system";
  document.documentElement.setAttribute("data-theme", theme);
}

function setupThemePicker() {
  var picker = document.getElementById("theme-picker");
  if (!picker) return;

  picker.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-theme]");
    if (!btn) return;

    picker.querySelectorAll(".theme-option").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    // Live preview
    document.documentElement.setAttribute("data-theme", btn.dataset.theme);
  });
}

async function loadThemePicker() {
  var theme = (await getStored("theme")) || "system";
  var picker = document.getElementById("theme-picker");
  picker.querySelectorAll(".theme-option").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

async function getWorkOrgs() {
  return parseOrgList(await getStored("workOrgs"));
}

async function getPersonalOrgs() {
  return parseOrgList(await getStored("personalOrgs"));
}

// --- Setup form ---

function setupSetupForm() {
  var form = document.getElementById("setup-form");
  var errorEl = document.getElementById("setup-error");

  // Use onsubmit to avoid stacking listeners on repeated calls (e.g. after logout)
  form.onsubmit = async function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    var token = document.getElementById("setup-token").value.trim();

    if (!token) {
      showError(errorEl, "Token is required");
      return;
    }

    try {
      await fetchUsername(token);
      await setStored({ githubToken: token });

      showScreen(dashboard);
      setupHeaderButtons(token);
      await loadDashboard(token);
    } catch (err) {
      console.error("Setup failed:", err);
      var msg = err.message?.includes("401")
        ? "Invalid token — check your PAT"
        : "Setup failed. Check the console for details.";
      showError(errorEl, msg);
    }
  };
}

// --- Header buttons ---

function setupHeaderButtons(token) {
  document.getElementById("refresh-btn").onclick = async function () {
    await removeStored(["dashboardCache", "dashboardCacheTime"]);
    await loadDashboard(token);
  };

  document.getElementById("settings-btn").onclick = function () { openSettings(); };
  document.getElementById("settings-close").onclick = function () { closeSettings(); };
  settingsModal.onclick = function (e) {
    if (e.target === settingsModal) closeSettings();
  };
  // Close settings on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !settingsModal.hidden) closeSettings();
  });
  setupThemePicker();

  document.getElementById("settings-save").onclick = async function () {
    var workInput = document.getElementById("work-orgs-input").value.trim();
    var personalInput = document.getElementById("personal-orgs-input").value.trim();
    var activeTheme = document.querySelector(".theme-option.active");
    var theme = activeTheme ? activeTheme.dataset.theme : "system";
    await setStored({ workOrgs: workInput, personalOrgs: personalInput, theme: theme });
    closeSettings();
    await removeStored(["dashboardCache", "dashboardCacheTime"]);
    await loadDashboard(token);
  };

  // Inline confirmation instead of window.confirm (broken in Firefox extension pages)
  var logoutBtn = document.getElementById("logout-btn");
  var logoutPending = false;
  logoutBtn.onclick = async function () {
    if (!logoutPending) {
      logoutPending = true;
      logoutBtn.title = "Click again to confirm";
      logoutBtn.classList.add("confirm");
      setTimeout(function () {
        logoutPending = false;
        logoutBtn.title = "Clear token & logout";
        logoutBtn.classList.remove("confirm");
      }, 3000);
      return;
    }
    await removeStored(["githubToken", "workOrgs", "personalOrgs", "theme", "dashboardCache", "dashboardCacheTime"]);
    showScreen(setupScreen);
    setupSetupForm();
  };
}

async function openSettings() {
  document.getElementById("work-orgs-input").value = (await getStored("workOrgs")) ?? "";
  document.getElementById("personal-orgs-input").value = (await getStored("personalOrgs")) ?? "";
  await loadThemePicker();
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

// --- Dashboard ---

async function loadDashboard(token) {
  var columns = document.getElementById("pr-columns");
  var cached = await getCachedData();
  if (cached) {
    await renderDashboard(cached);
    columns.hidden = false;
    loading.hidden = true;
    return;
  }

  var loadingStatus = document.getElementById("loading-status");
  columns.hidden = true;
  loading.hidden = false;
  errorBanner.hidden = true;
  loadingStatus.textContent = "Starting up...";

  try {
    var personalOrgs = await getPersonalOrgs();
    var data = await fetchDashboardData(token, personalOrgs, function (msg) {
      loadingStatus.textContent = msg;
    });
    loadingStatus.textContent = "Rendering dashboard...";
    await cacheData(data);
    await renderDashboard(data);
    columns.hidden = false;
  } catch (err) {
    console.error("Dashboard load failed:", err);
    errorBanner.textContent = friendlyError(err);
    errorBanner.hidden = false;
  } finally {
    loading.hidden = true;
  }
}

async function renderDashboard(data) {
  var badge = document.getElementById("username-badge");
  badge.textContent = "@" + data.username;
  badge.hidden = false;
  document.getElementById("last-updated").textContent = "Updated " + formatTime(new Date());

  var username = data.username;

  // Score and sort each column independently
  var reviewScored = scoreAndSort(data.reviewRequested || [], username, "review-requested");
  var authoredScored = scoreAndSort(data.authored || [], username, "authored");

  // Personal PRs: deduplicate against authored and review-requested
  var seen = {};
  (data.authored || []).forEach(function (pr) { seen[pr.url] = true; });
  (data.reviewRequested || []).forEach(function (pr) { seen[pr.url] = true; });
  var uniquePersonal = (data.personalPrs || []).filter(function (pr) { return !seen[pr.url]; });
  var personalScored = scoreAndSort(uniquePersonal, username, "personal");

  var workOrgs = await getWorkOrgs();

  renderColumn("review-requested", reviewScored, workOrgs);
  renderColumn("authored", authoredScored, workOrgs);
  renderColumn("personal", personalScored, workOrgs);

  var isEmpty = reviewScored.length === 0 && authoredScored.length === 0 && personalScored.length === 0;
  document.getElementById("empty-state").hidden = !isEmpty;
}

function scoreAndSort(prs, username, context) {
  var scored = [];
  for (var i = 0; i < prs.length; i++) {
    var result = scorePr(prs[i], username, context);
    scored.push({ pr: prs[i], score: result.score, reason: result.reason, context: context });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored;
}

function renderColumn(id, items, workOrgs) {
  var section = document.getElementById("section-" + id);
  var list = document.getElementById("list-" + id);
  var count = document.getElementById("count-" + id);

  section.hidden = items.length === 0;
  count.textContent = items.length;

  list.innerHTML = items.map(function (item) {
    return renderScoredCard(item, workOrgs);
  }).join("");
}

function severityLevel(score) {
  if (score >= 40) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function renderScoredCard(item, workOrgs) {
  var pr = item.pr;
  var repo = pr.repository?.nameWithOwner ?? "";
  var author = pr.author?.login ?? "unknown";
  var avatarUrl = pr.author?.avatarUrl ?? "";
  var age = timeAgo(pr.createdAt);
  var severity = severityLevel(item.score);

  var statusClass = "review-required";
  var statusText = "Review needed";
  if (pr.isDraft) {
    statusClass = "draft";
    statusText = "Draft";
  } else if (pr.reviewDecision === "APPROVED") {
    statusClass = "approved";
    statusText = "Approved";
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    statusClass = "changes-requested";
    statusText = "Changes requested";
  }

  var orgName = repo.split("/")[0] || "";

  var safeUrl = isSafeUrl(pr.url) ? escapeAttr(pr.url) : "#";
  var safeAvatar = isSafeUrl(avatarUrl) ? escapeAttr(avatarUrl) : "";

  // -- Tags row (top) --
  var tagsHtml = '<div class="pr-badges">';
  if (orgName) {
    var isWork = workOrgs.length > 0 && workOrgs.indexOf(orgName.toLowerCase()) !== -1;
    tagsHtml += '<span class="org-badge ' + (isWork ? "org-work" : "org-personal") + '">' + escapeHtml(orgName) + '</span>';
  }
  tagsHtml += '<span class="status-badge ' + escapeAttr(statusClass) + '">' + escapeHtml(statusText) + '</span>';
  tagsHtml += '</div>';

  // -- Card --
  var html = '<div class="pr-card severity-' + severity + '">'
    + '<div class="severity-bar"></div>'
    + '<div class="pr-card-inner">'
    +   tagsHtml
    +   '<div class="pr-body">'
    +     '<img class="pr-avatar" src="' + safeAvatar + '" alt="' + escapeAttr(author) + '" width="28" height="28" loading="lazy">'
    +     '<div class="pr-main">'
    +       '<div class="pr-title">'
    +         '<a href="' + safeUrl + '" target="_blank" rel="noopener">' + escapeHtml(pr.title) + '</a>'
    +       '</div>'
    +       '<div class="pr-repo">' + escapeHtml(repo) + ' #' + (parseInt(pr.number, 10) || 0) + '</div>';

  if (item.reason) {
    html += '<div class="pr-reason">' + escapeHtml(item.reason) + '</div>';
  }

  html += '<div class="pr-meta">'
    +       '<span>' + escapeHtml(author) + '</span>'
    +       '<span>' + age + '</span>'
    +       '<span class="diff-stat">'
    +         '<span class="additions">+' + (parseInt(pr.additions, 10) || 0) + '</span>'
    +         '<span class="deletions">-' + (parseInt(pr.deletions, 10) || 0) + '</span>'
    +       '</span>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '</div></div>';

  return html;
}


// --- Cache ---

function getCachedData() {
  return storageGet(["dashboardCache", "dashboardCacheTime"]).then(function (result) {
    if (!result.dashboardCache || !result.dashboardCacheTime) return null;
    var age = Date.now() - result.dashboardCacheTime;
    return age < CACHE_TTL_MS ? result.dashboardCache : null;
  });
}

function cacheData(data) {
  return setStored({ dashboardCache: data, dashboardCacheTime: Date.now() });
}

// --- Utilities ---

function friendlyError(err) {
  var msg = err.message || "";
  if (msg.indexOf("502") !== -1 || msg.indexOf("503") !== -1 || msg.indexOf("504") !== -1) {
    return "GitHub is having issues right now. Hit refresh to try again, or just open a new tab in a bit.";
  }
  if (msg.indexOf("429") !== -1) {
    return "GitHub rate limit hit. The dashboard will work again in a few minutes.";
  }
  if (msg.indexOf("401") !== -1) {
    return "Your token seems invalid or expired. Try clearing it (logout button) and setting up a new one.";
  }
  if (msg.indexOf("Failed to fetch") !== -1 || msg.indexOf("NetworkError") !== -1) {
    return "Can't reach GitHub. Check your internet connection and try again.";
  }
  return "Something went wrong loading your PRs. Hit refresh to try again.";
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function timeAgo(dateStr) {
  var date = new Date(dateStr);
  if (isNaN(date.getTime())) return "unknown";
  var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  var days = Math.floor(hours / 24);
  return days + "d ago";
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSafeUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (e) {
    return false;
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Boot ---

init();
