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

var DEFAULT_COLORS = ["#58a6ff", "#bc8cff", "#3fb950", "#d29922", "#f85149", "#8b949e"];

async function getOrgConfig() {
  var raw = await getStored("orgs");
  if (!raw || !Array.isArray(raw)) return [];
  return raw;
}

function getOrgLookup(orgConfig) {
  var lookup = {};
  for (var i = 0; i < orgConfig.length; i++) {
    lookup[orgConfig[i].name.toLowerCase()] = orgConfig[i];
  }
  return lookup;
}

function getPersonalOrgNames(orgConfig) {
  return orgConfig.map(function (o) { return o.name.toLowerCase(); });
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
      var username = await fetchUsername(token);
      await setStored({ githubToken: token, githubUsername: username });

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

  document.getElementById("add-org-btn").onclick = function () {
    addOrgRow({ name: "", color: DEFAULT_COLORS[document.querySelectorAll(".org-row").length % DEFAULT_COLORS.length], work: false }, "");
  };

  document.getElementById("settings-save").onclick = async function () {
    var orgs = collectOrgConfig();
    var activeTheme = document.querySelector(".theme-option.active");
    var theme = activeTheme ? activeTheme.dataset.theme : "system";
    await setStored({ orgs: orgs, theme: theme });
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
    await removeStored(["githubToken", "githubUsername", "orgs", "theme", "dashboardCache", "dashboardCacheTime"]);
    showScreen(setupScreen);
    setupSetupForm();
  };
}

async function openSettings() {
  var orgConfig = await getOrgConfig();
  var username = (await getStored("githubUsername")) || "";

  // Ensure the user's own account is in the list
  if (username) {
    var hasOwn = orgConfig.some(function (o) { return o.name.toLowerCase() === username.toLowerCase(); });
    if (!hasOwn) {
      orgConfig.push({ name: username, color: "#8b949e", work: false, isUser: true });
    } else {
      // Mark the existing entry so we know not to allow deletion
      for (var i = 0; i < orgConfig.length; i++) {
        if (orgConfig[i].name.toLowerCase() === username.toLowerCase()) {
          orgConfig[i].isUser = true;
        }
      }
    }
  }

  renderOrgList(orgConfig, username);
  await loadThemePicker();
  settingsModal.hidden = false;
}

function renderOrgList(orgs, username) {
  var list = document.getElementById("org-list");
  list.innerHTML = "";
  for (var i = 0; i < orgs.length; i++) {
    addOrgRow(orgs[i], username);
  }
}

function addOrgRow(org, username) {
  var locked = org.isUser || (username && org.name.toLowerCase() === (username || "").toLowerCase());
  var list = document.getElementById("org-list");
  var row = document.createElement("div");
  row.className = "org-row" + (locked ? " org-row-locked" : "");
  row.draggable = true;

  row.innerHTML = '<span class="org-drag-handle">&#x2630;</span>'
    + (locked
      ? '<span class="org-name-label">' + escapeHtml(org.name) + '</span>'
      : '<input type="text" class="org-name-input" value="' + escapeAttr(org.name) + '" placeholder="org-name">')
    + '<input type="color" class="org-color-input" value="' + escapeAttr(org.color || "#8b949e") + '">'
    + '<button type="button" class="org-work-toggle ' + (org.work ? "active" : "") + '">work</button>'
    + (locked ? '' : '<button type="button" class="org-delete-btn">&times;</button>');

  if (locked) {
    // Store the name in a hidden input so collectOrgConfig picks it up
    var hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.className = "org-name-input";
    hidden.value = org.name;
    row.appendChild(hidden);
  }

  row.querySelector(".org-work-toggle").onclick = function () {
    this.classList.toggle("active");
  };

  var deleteBtn = row.querySelector(".org-delete-btn");
  if (deleteBtn) {
    deleteBtn.onclick = function () { row.remove(); };
  }

  // Drag and drop reordering
  row.addEventListener("dragstart", function (e) {
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  row.addEventListener("dragend", function () {
    row.classList.remove("dragging");
    list.querySelectorAll(".org-row").forEach(function (r) { r.classList.remove("drag-over"); });
  });

  row.addEventListener("dragover", function (e) {
    e.preventDefault();
    var dragging = list.querySelector(".dragging");
    if (dragging && dragging !== row) {
      row.classList.add("drag-over");
      var rect = row.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        list.insertBefore(dragging, row);
      } else {
        list.insertBefore(dragging, row.nextSibling);
      }
    }
  });

  row.addEventListener("dragleave", function () {
    row.classList.remove("drag-over");
  });

  list.appendChild(row);
}

function collectOrgConfig() {
  var list = document.getElementById("org-list");
  var rows = list.querySelectorAll(".org-row");
  var orgs = [];
  rows.forEach(function (row) {
    var nameInput = row.querySelector(".org-name-input");
    var name = nameInput ? nameInput.value.trim().toLowerCase() : "";
    if (!name) return;
    orgs.push({
      name: name,
      color: row.querySelector(".org-color-input").value,
      work: row.querySelector(".org-work-toggle").classList.contains("active"),
    });
  });
  return orgs;
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
    var orgConfig = await getOrgConfig();
    var personalOrgNames = getPersonalOrgNames(orgConfig);
    var data = await fetchDashboardData(token, personalOrgNames, function (msg) {
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
  await setStored({ githubUsername: username });
  var orgConfig = await getOrgConfig();

  // Ensure the user's own account is always in the org config
  var hasOwn = orgConfig.some(function (o) { return o.name.toLowerCase() === username.toLowerCase(); });
  if (!hasOwn) {
    orgConfig.push({ name: username, color: "#8b949e", work: false });
    await setStored({ orgs: orgConfig });
  }
  var orgLookup = getOrgLookup(orgConfig);

  // Score and sort each column: by org order first, then by urgency
  var reviewScored = scoreAndSort(data.reviewRequested || [], username, "review-requested", orgConfig);
  var authoredScored = scoreAndSort(data.authored || [], username, "authored", orgConfig);

  // Personal PRs: deduplicate against authored and review-requested
  var seen = {};
  (data.authored || []).forEach(function (pr) { seen[pr.url] = true; });
  (data.reviewRequested || []).forEach(function (pr) { seen[pr.url] = true; });
  var uniquePersonal = (data.personalPrs || []).filter(function (pr) { return !seen[pr.url]; });
  var personalScored = scoreAndSort(uniquePersonal, username, "personal", orgConfig);

  renderColumn("review-requested", reviewScored, orgLookup);
  renderColumn("authored", authoredScored, orgLookup);
  renderColumn("personal", personalScored, orgLookup);

  var isEmpty = reviewScored.length === 0 && authoredScored.length === 0 && personalScored.length === 0;
  document.getElementById("empty-state").hidden = !isEmpty;
}

function scoreAndSort(prs, username, context, orgConfig) {
  // Build org order lookup: configured orgs get their index, unknown orgs go last
  var orgOrder = {};
  for (var o = 0; o < orgConfig.length; o++) {
    orgOrder[orgConfig[o].name.toLowerCase()] = o;
  }
  var maxOrder = orgConfig.length;

  var scored = [];
  for (var i = 0; i < prs.length; i++) {
    var result = scorePr(prs[i], username, context);
    var owner = ((prs[i].repository && prs[i].repository.nameWithOwner) || "").split("/")[0].toLowerCase();
    var order = (owner in orgOrder) ? orgOrder[owner] : maxOrder;
    scored.push({ pr: prs[i], score: result.score, reason: result.reason, context: context, orgOrder: order });
  }
  // Sort by org order first, then by score descending within each org
  scored.sort(function (a, b) {
    if (a.orgOrder !== b.orgOrder) return a.orgOrder - b.orgOrder;
    return b.score - a.score;
  });
  return scored;
}

function renderColumn(id, items, orgLookup) {
  var section = document.getElementById("section-" + id);
  var list = document.getElementById("list-" + id);
  var count = document.getElementById("count-" + id);

  section.hidden = items.length === 0;
  count.textContent = items.length;

  list.innerHTML = items.map(function (item) {
    return renderScoredCard(item, orgLookup);
  }).join("");
}

function severityLevel(score) {
  if (score >= 40) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function renderScoredCard(item, orgLookup) {
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
    var orgConf = orgLookup[orgName.toLowerCase()];
    var badgeStyle = orgConf ? ' style="background:' + escapeAttr(orgConf.color) + '22;color:' + escapeAttr(orgConf.color) + '"' : "";
    tagsHtml += '<span class="org-badge"' + badgeStyle + '>' + escapeHtml(orgName) + '</span>';
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
