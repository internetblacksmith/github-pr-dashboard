/**
 * New tab page controller.
 *
 * Flow:
 * 1. Check if token exists in storage
 *    - No  -> show setup screen
 *    - Yes -> fetch data and render dashboard
 *
 * Each org gets a colour badge derived from its name, overridable in settings.
 * A "Personal Projects" column shows all open PRs in the user's repos
 * and any additional personal orgs.
 *
 * Works on both Chrome (chrome.*) and Firefox (browser.*).
 */

// Prefer Firefox's promise-based browser.* API, fall back to Chrome's.
var isFirefox = (typeof browser !== "undefined");
var api = isFirefox ? browser : chrome;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Hosts that PR links and avatars may point to. Everything comes from the
// GitHub API over TLS, so this is defence in depth, not a live threat.
const SAFE_URL_HOSTS = /^(github\.com|[a-z0-9-]+\.githubusercontent\.com)$/;

// DOM references
const setupScreen = document.getElementById("setup-screen");
const dashboard = document.getElementById("dashboard");
const loading = document.getElementById("loading");
const errorBanner = document.getElementById("error-banner");
const settingsModal = document.getElementById("settings-modal");

function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-tooltip]").forEach(function (el) {
    el.dataset.tooltip = t(el.dataset.i18nTooltip);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.title = t("appName");
}

async function init() {
  try {
    await applyTheme();
    translatePage();

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

// Company teammates (GitHub logins), not a GitHub team. Their open PRs join
// the Review Requested column so nobody's work sits unreviewed.
async function getTeammates() {
  return getStoredNames("teammates");
}

// Organisations teammates' PRs are limited to (empty = any repo they own or work in)
async function getTeammateOrgs() {
  return getStoredNames("teammateOrgs");
}

async function getStoredNames(key) {
  var raw = await getStored(key);
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter(function (l) { return typeof l === "string"; });
}

// --- Org colours ---

function hashOrgColor(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  var hue = Math.abs(hash) % 360;
  return hslToHex(hue, 65, 55);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  var a = s * Math.min(l, 1 - l);
  function f(n) {
    var k = (n + h / 30) % 12;
    var val = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * val).toString(16).padStart(2, "0");
  }
  return "#" + f(0) + f(8) + f(4);
}

function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function getOrgColor(orgName, orgLookup, orgColorOverrides) {
  var key = orgName.toLowerCase();
  // Color override from the org colours section takes priority
  if (orgColorOverrides && orgColorOverrides[key]) {
    var hex = orgColorOverrides[key];
    return { color: hex, bg: hexToRgba(hex, 0.1) };
  }
  // Then check the org config list
  var conf = orgLookup && orgLookup[key];
  var color = conf ? conf.color : hashOrgColor(orgName);
  return { color: color, bg: hexToRgba(color, 0.1) };
}

async function getOrgColorOverrides() {
  return (await getStored("orgColors")) || {};
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
      showError(errorEl, t("tokenRequired"));
      return;
    }

    try {
      var username = await fetchUsername(token);
      // Drop any cache left by a previous account before storing the new identity
      await storageRemove(["dashboardCache", "dashboardCacheTime"]);
      await storageSet({ githubToken: token, githubUsername: username });

      showScreen(dashboard);
      setupHeaderButtons(token);
      await loadDashboard(token);
    } catch (err) {
      console.error("Setup failed:", err);
      var errMsg = err.message || "";
      var msg;
      if (errMsg.indexOf("401") !== -1) {
        msg = t("tokenInvalid");
      } else if (errMsg.indexOf("403") !== -1 || errMsg.indexOf("INSUFFICIENT") !== -1 || errMsg.indexOf("FORBIDDEN") !== -1) {
        msg = t("tokenScopes");
      } else {
        msg = t("setupFailed");
      }
      showError(errorEl, msg);
    }
  };
}

// --- Header buttons ---

function setupHeaderButtons(token) {
  document.getElementById("refresh-btn").onclick = async function () {
    // Keep the current cards on screen while fresh data loads
    await loadDashboard(token, true);
  };

  document.getElementById("settings-btn").onclick = function () { openSettings(); };
  document.getElementById("settings-close").onclick = function () { closeSettings(); };
  settingsModal.onclick = function (e) {
    if (e.target === settingsModal) closeSettings();
  };
  // Close settings on Escape key (use onkeydown to avoid stacking on re-init)
  document.onkeydown = function (e) {
    if (e.key === "Escape" && !settingsModal.hidden) closeSettings();
  };
  setupThemePicker();
  setupSettingsNav();

  document.getElementById("add-org-btn").onclick = function () {
    addOrgRow({ name: "", color: DEFAULT_COLORS[document.querySelectorAll(".org-row").length % DEFAULT_COLORS.length] }, "");
  };

  document.getElementById("add-teammate-btn").onclick = function () {
    addNameRow("teammate-list", "", "teammatePlaceholder", "tooltipRemoveTeammate");
    focusLastInput("teammate-list");
  };
  document.getElementById("add-teammate-org-btn").onclick = function () {
    addNameRow("teammate-org-list", "", "orgPlaceholder", "tooltipRemoveOrg");
    focusLastInput("teammate-org-list");
  };

  document.getElementById("settings-save").onclick = async function () {
    // Invalid names block the save so nothing odd reaches the search query
    var teammates = collectTeammates();
    var teammateOrgs = collectTeammateOrgs();
    if (teammates === null || teammateOrgs === null) {
      showSettingsSection("teammates");
      return;
    }

    var oldOrgs = await getOrgConfig();
    var oldTeammates = await getTeammates();
    var oldTeammateOrgs = await getTeammateOrgs();
    var orgs = collectOrgConfig();
    var orgColors = {};
    document.querySelectorAll(".org-color-override").forEach(function (input) {
      orgColors[input.dataset.org] = input.value;
    });
    var activeTheme = document.querySelector(".theme-option.active");
    var theme = activeTheme ? activeTheme.dataset.theme : "system";
    await storageSet({ orgs: orgs, orgColors: orgColors, theme: theme, teammates: teammates, teammateOrgs: teammateOrgs });
    closeSettings();

    // Only re-fetch if the queried names changed; color/theme changes just re-render
    var oldNames = oldOrgs.map(function (o) { return o.name; }).join(",") + "|" + oldTeammates.join(",") + "|" + oldTeammateOrgs.join(",");
    var newNames = orgs.map(function (o) { return o.name; }).join(",") + "|" + teammates.join(",") + "|" + teammateOrgs.join(",");
    if (oldNames !== newNames) {
      await storageRemove(["dashboardCache", "dashboardCacheTime"]);
    }
    await loadDashboard(token);
  };

  // Logout confirmation modal (window.confirm is broken in Firefox extension pages)
  var logoutModal = document.getElementById("logout-modal");
  document.getElementById("logout-btn").onclick = function () {
    logoutModal.hidden = false;
  };
  document.getElementById("logout-cancel").onclick = function () {
    logoutModal.hidden = true;
  };
  logoutModal.onclick = function (e) {
    if (e.target === logoutModal) logoutModal.hidden = true;
  };
  document.getElementById("logout-confirm").onclick = async function () {
    logoutModal.hidden = true;
    await storageRemove(["githubToken", "githubUsername", "orgs", "orgColors", "theme", "teammates", "teammateOrgs", "dashboardCache", "dashboardCacheTime"]);
    clearDashboardDom();
    showScreen(setupScreen);
    setupSetupForm();
  };
}

// Wipe rendered PR data so nothing from the previous account stays on screen
function clearDashboardDom() {
  ["review-requested", "authored", "personal"].forEach(function (id) {
    document.getElementById("list-" + id).innerHTML = "";
    document.getElementById("count-" + id).textContent = "";
    document.getElementById("section-" + id).hidden = true;
  });
  var filters = document.getElementById("org-filters");
  filters.innerHTML = "";
  filters.hidden = true;
  document.getElementById("pr-columns").hidden = true;
  document.getElementById("empty-state").hidden = true;
  document.getElementById("last-updated").textContent = "";
  var badge = document.getElementById("username-badge");
  badge.textContent = "";
  badge.hidden = true;
  errorBanner.hidden = true;
}

// A logout in any tab (including this one) reloads every open dashboard tab,
// which also kills any background refresh that could write stale data back.
function watchForLogout() {
  if (!api.storage || !api.storage.onChanged) return;
  api.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.githubToken && !changes.githubToken.newValue) {
      location.reload();
    }
  });
}

// --- Settings sections ---

function setupSettingsNav() {
  var nav = settingsModal.querySelector(".settings-nav");
  if (!nav) return;
  nav.onclick = function (e) {
    var item = e.target.closest(".settings-nav-item");
    if (item) showSettingsSection(item.dataset.section);
  };
}

function showSettingsSection(name) {
  settingsModal.querySelectorAll(".settings-nav-item").forEach(function (item) {
    var active = item.dataset.section === name;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
  settingsModal.querySelectorAll(".settings-pane").forEach(function (pane) {
    pane.hidden = pane.dataset.section !== name;
  });
  var panes = settingsModal.querySelector(".settings-panes");
  if (panes) panes.scrollTop = 0;
}

// Focus trap helper: hidden panes still hold inputs, skip anything not reachable
function isFocusable(el) {
  if (!el || el.disabled) return false;
  if (typeof el.closest === "function" && el.closest("[hidden]")) return false;
  return true;
}

var settingsPreviousFocus = null;

async function openSettings() {
  settingsPreviousFocus = document.activeElement;
  var orgConfig = await getOrgConfig();
  var username = (await getStored("githubUsername")) || "";

  // Ensure the user's own account is in the list
  if (username) {
    var hasOwn = orgConfig.some(function (o) { return o.name.toLowerCase() === username.toLowerCase(); });
    if (!hasOwn) {
      orgConfig.push({ name: username, color: "#8b949e", isUser: true });
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
  renderNameList("teammate-list", "teammate-error", await getTeammates(), "teammatePlaceholder", "tooltipRemoveTeammate");
  renderNameList("teammate-org-list", "teammate-org-error", await getTeammateOrgs(), "orgPlaceholder", "tooltipRemoveOrg");
  await loadOrgColorPickers();
  await loadThemePicker();
  showSettingsSection("orgs");
  settingsModal.hidden = false;

  // Focus the first section in the nav
  var firstInput = settingsModal.querySelector(".settings-nav-item, input, button:not(#settings-close)");
  if (firstInput) firstInput.focus();

  // Focus trap within the modal
  settingsModal.onkeydown = function (e) {
    if (e.key !== "Tab") return;
    var focusable = Array.prototype.filter.call(
      settingsModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      isFocusable
    );
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
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

  row.innerHTML = '<span class="org-drag-handle" aria-label="' + escapeAttr(t("dragHandle")) + '">&#x2630;</span>'
    + '<span class="org-reorder-btns">'
    + '<button type="button" class="org-move-btn" data-dir="up" aria-label="' + escapeAttr(t("moveUp")) + '">&#x25B2;</button>'
    + '<button type="button" class="org-move-btn" data-dir="down" aria-label="' + escapeAttr(t("moveDown")) + '">&#x25BC;</button>'
    + '</span>'
    + '<input type="text" class="org-name-input" value="' + escapeAttr(org.name) + '" placeholder="' + escapeAttr(t("orgPlaceholder")) + '"' + (locked ? " disabled" : "") + '>'
    + '<input type="color" class="org-color-input" value="' + escapeAttr(org.color || "#8b949e") + '">'
    + '<button type="button" class="org-delete-btn has-tooltip" data-tooltip="' + escapeAttr(locked ? t("tooltipAccountLocked") : t("tooltipRemoveOrg")) + '"' + (locked ? " disabled" : "") + '>&times;</button>';

  row.querySelector(".org-delete-btn").onclick = function () {
    if (!this.disabled) row.remove();
  };

  // Keyboard reorder buttons
  row.querySelectorAll(".org-move-btn").forEach(function (btn) {
    btn.onclick = function () {
      if (btn.dataset.dir === "up" && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
      } else if (btn.dataset.dir === "down" && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
      }
      btn.focus();
    };
  });

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

// --- Name lists in settings (teammate logins, teammate orgs) ---
// Simple text rows: no colour, no drag. Logins and org names share GitHub's
// naming rules, so one validator covers both.

function renderNameList(listId, errorId, names, placeholderKey, removeKey) {
  var list = document.getElementById(listId);
  list.innerHTML = "";
  document.getElementById(errorId).hidden = true;
  for (var i = 0; i < names.length; i++) {
    addNameRow(listId, names[i], placeholderKey, removeKey);
  }
}

function addNameRow(listId, value, placeholderKey, removeKey) {
  var list = document.getElementById(listId);
  var row = document.createElement("div");
  row.className = "org-row teammate-row";
  row.innerHTML = '<input type="text" class="teammate-input" value="' + escapeAttr(value) + '"'
    + ' placeholder="' + escapeAttr(t(placeholderKey)) + '" autocomplete="off" spellcheck="false">'
    + '<button type="button" class="org-delete-btn has-tooltip" data-tooltip="' + escapeAttr(t(removeKey)) + '">&times;</button>';
  row.querySelector(".org-delete-btn").onclick = function () { row.remove(); };
  list.appendChild(row);
}

function focusLastInput(listId) {
  var inputs = document.getElementById(listId).querySelectorAll(".teammate-input");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

/**
 * Reads the rows of a name list. Returns a deduplicated array of lowercase
 * names, or null when any non-empty value is not a valid GitHub name (the
 * offending inputs are marked and the error hint shown). Empty rows are ignored.
 */
function collectNames(listId, errorId, invalidKey) {
  var list = document.getElementById(listId);
  var errorEl = document.getElementById(errorId);
  var names = [];
  var seen = {};
  var invalid = [];
  list.querySelectorAll(".teammate-input").forEach(function (input) {
    var name = input.value.trim().toLowerCase();
    input.classList.toggle("invalid", false);
    if (!name) return;
    if (!isValidLogin(name)) {
      invalid.push(name);
      input.classList.toggle("invalid", true);
      return;
    }
    if (!seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  });
  if (invalid.length > 0) {
    errorEl.textContent = t(invalidKey, invalid.join(", "));
    errorEl.hidden = false;
    return null;
  }
  errorEl.hidden = true;
  return names;
}

function collectTeammates() {
  return collectNames("teammate-list", "teammate-error", "teammateInvalid");
}

function collectTeammateOrgs() {
  return collectNames("teammate-org-list", "teammate-org-error", "teammateOrgInvalid");
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
    });
  });
  return orgs;
}

function closeSettings() {
  settingsModal.hidden = true;
  settingsModal.onkeydown = null;
  if (settingsPreviousFocus && settingsPreviousFocus.focus) {
    settingsPreviousFocus.focus();
  }
}

async function loadOrgColorPickers() {
  var container = document.getElementById("org-color-list");
  var orgColorOverrides = await getOrgColorOverrides();
  var orgConfig = await getOrgConfig();
  var orgLookup = getOrgLookup(orgConfig);

  // Collect orgs from rendered cards, excluding ones already in the personal org list
  var configuredOrgs = {};
  for (var c = 0; c < orgConfig.length; c++) {
    configuredOrgs[orgConfig[c].name.toLowerCase()] = true;
  }

  var orgs = [];
  var seen = {};
  document.querySelectorAll(".pr-card[data-org]").forEach(function (card) {
    var org = card.dataset.org;
    if (org && !seen[org] && !configuredOrgs[org]) {
      seen[org] = true;
      orgs.push(org);
    }
  });
  orgs.sort();

  if (orgs.length === 0) {
    container.innerHTML = "";
    return;
  }

  var html = '<p class="field-hint">' + escapeHtml(t("discoveredOrgsHint")) + '</p>';
  for (var i = 0; i < orgs.length; i++) {
    var current = getOrgColor(orgs[i], orgLookup, orgColorOverrides);
    html += '<div class="org-row org-row-discovered">'
      + '<span class="org-drag-handle" style="visibility:hidden">&#x2630;</span>'
      + '<input type="text" class="org-name-input" value="' + escapeAttr(orgs[i]) + '" disabled>'
      + '<input type="color" class="org-color-override" data-org="' + escapeAttr(orgs[i]) + '" value="' + escapeAttr(current.color) + '">'
      + '<button type="button" class="org-promote-btn has-tooltip" data-tooltip="' + escapeAttr(t("tooltipPromoteOrg")) + '" data-org="' + escapeAttr(orgs[i]) + '" data-color="' + escapeAttr(current.color) + '">+</button>'
      + '</div>';
  }
  container.innerHTML = html;

  container.onclick = function (e) {
    var btn = e.target.closest(".org-promote-btn");
    if (!btn) return;
    var orgName = btn.dataset.org;
    var color = btn.dataset.color;
    addOrgRow({ name: orgName, color: color }, "");
    btn.closest(".org-row").remove();
    // Hide section if no discovered orgs remain
    if (!container.querySelector(".org-row")) {
      container.innerHTML = "";
    }
  };
}

// --- Dashboard ---

/**
 * Stale-while-revalidate:
 *   - cached data (any age) renders immediately
 *   - fresh cache (< TTL) and no force → done
 *   - stale cache, or forceRefresh → refetch in the background, cards stay visible
 *   - no cache → spinner, then render
 */
async function loadDashboard(token, forceRefresh) {
  var columns = document.getElementById("pr-columns");
  var cached = await getCachedData();
  if (cached) {
    await renderDashboard(cached.data, cached.time);
    columns.hidden = false;
    loading.hidden = true;
    if (cached.fresh && !forceRefresh) return;
  }
  await refreshDashboard(token, !!cached);
}

// Only one fetch at a time per page — refresh clicks while loading are no-ops.
// The promise is tied to its token so a login as a different account never
// piggybacks on the previous account's fetch.
var refreshInFlight = null;
var refreshInFlightToken = null;

function refreshDashboard(token, hasStaleData) {
  if (refreshInFlight && refreshInFlightToken === token) return refreshInFlight;
  refreshInFlightToken = token;
  refreshInFlight = fetchAndRender(token, hasStaleData).finally(function () {
    if (refreshInFlightToken === token) {
      refreshInFlight = null;
      refreshInFlightToken = null;
    }
  });
  return refreshInFlight;
}

async function fetchAndRender(token, hasStaleData) {
  var columns = document.getElementById("pr-columns");
  var loadingStatus = document.getElementById("loading-status");
  var lastUpdated = document.getElementById("last-updated");
  errorBanner.hidden = true;

  if (hasStaleData) {
    lastUpdated.textContent = t("refreshing");
  } else {
    columns.hidden = true;
    document.getElementById("org-filters").hidden = true;
    loading.hidden = false;
    loadingStatus.textContent = t("loadingStarting");
  }

  try {
    var orgConfig = await getOrgConfig();
    var personalOrgNames = getPersonalOrgNames(orgConfig);
    var data = await fetchDashboardData(token, {
      personalOrgs: personalOrgNames,
      teammates: await getTeammates(),
      teammateOrgs: await getTeammateOrgs(),
    }, function (msg) {
      if (!hasStaleData) loadingStatus.textContent = msg;
    });

    // User logged out while we were fetching — don't resurrect their data
    if ((await getStored("githubToken")) !== token) return;

    if (!hasStaleData) loadingStatus.textContent = t("loadingRendering");
    var fetchedAt = Date.now();
    await cacheData(data, fetchedAt);
    await renderDashboard(data, fetchedAt);
    columns.hidden = false;
  } catch (err) {
    console.error("Dashboard load failed:", err);
    errorBanner.textContent = friendlyError(err);
    errorBanner.hidden = false;
    if (hasStaleData) {
      // Keep the stale cards and put the real timestamp back
      var cached = await getCachedData();
      if (cached) lastUpdated.textContent = t("updatedAt", formatTime(new Date(cached.time)));
    }
  } finally {
    loading.hidden = true;
  }
}

async function renderDashboard(data, fetchedAt) {
  var badge = document.getElementById("username-badge");
  badge.textContent = "@" + data.username;
  badge.hidden = false;
  document.getElementById("last-updated").textContent = t("updatedAt", formatTime(new Date(fetchedAt || Date.now())));

  var username = data.username;
  await storageSet({ githubUsername: username });
  var orgConfig = await getOrgConfig();

  // Ensure the user's own account is always in the org config
  var hasOwn = orgConfig.some(function (o) { return o.name.toLowerCase() === username.toLowerCase(); });
  if (!hasOwn) {
    orgConfig.push({ name: username, color: "#8b949e" });
    await storageSet({ orgs: orgConfig });
  }
  var orgLookup = getOrgLookup(orgConfig);
  var orgColorOverrides = await getOrgColorOverrides();

  // Review Requested = explicit requests + teammates' PRs nobody asked us about.
  // A PR in both keeps the requested one; a teammate PR that names us under
  // reviewRequests counts as requested even if the requested search overflowed.
  var reviewItems = mergeReviewRequested(data.reviewRequested || [], data.teammatePrs || [], username);

  // Score and sort each column: by org order first, then by urgency
  var reviewScored = scoreAndSort(reviewItems, username, "review-requested", orgConfig);
  var authoredScored = scoreAndSort(data.authored || [], username, "authored", orgConfig);

  // Personal PRs: deduplicate against everything already shown
  var seen = {};
  (data.authored || []).forEach(function (pr) { seen[pr.url] = true; });
  reviewItems.forEach(function (pr) { seen[pr.url] = true; });
  var uniquePersonal = (data.personalPrs || []).filter(function (pr) { return !seen[pr.url]; });
  var personalScored = scoreAndSort(uniquePersonal, username, "personal", orgConfig);

  var allOrgs = collectOrgs(reviewScored.concat(authoredScored, personalScored));
  renderOrgFilters(allOrgs, orgLookup, orgColorOverrides);

  renderColumn("review-requested", reviewScored, orgLookup, orgColorOverrides);
  renderColumn("authored", authoredScored, orgLookup, orgColorOverrides);
  renderColumn("personal", personalScored, orgLookup, orgColorOverrides);

  var isEmpty = reviewScored.length === 0 && authoredScored.length === 0 && personalScored.length === 0;
  document.getElementById("empty-state").hidden = !isEmpty;
}

function mergeReviewRequested(requested, teammatePrs, username) {
  var seen = {};
  var merged = [];
  requested.forEach(function (pr) {
    if (seen[pr.url]) return;
    seen[pr.url] = true;
    pr.source = "requested";
    merged.push(pr);
  });
  teammatePrs.forEach(function (pr) {
    if (seen[pr.url]) return;
    if (pr.author && pr.author.login && pr.author.login.toLowerCase() === username.toLowerCase()) return;
    seen[pr.url] = true;
    pr.source = isDirectlyRequested(pr, username) ? "requested" : "teammates";
    merged.push(pr);
  });
  return merged;
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
    scored.push({ pr: prs[i], score: result.score, reason: result.reason, needsReview: !!result.needsReview, tier: result.tier || 3, context: context, orgOrder: order, orgName: owner });
  }
  // Review Requested: tier first (needs you, team needs a review, settled).
  // Then org order, then alphabetically for unconfigured orgs, then by score.
  var byTier = context === "review-requested";
  scored.sort(function (a, b) {
    if (byTier && a.tier !== b.tier) return a.tier - b.tier;
    if (a.orgOrder !== b.orgOrder) return a.orgOrder - b.orgOrder;
    if (a.orgOrder === maxOrder && a.orgName !== b.orgName) return a.orgName < b.orgName ? -1 : 1;
    return b.score - a.score;
  });
  return scored;
}

function renderColumn(id, items, orgLookup, orgColorOverrides) {
  var section = document.getElementById("section-" + id);
  var list = document.getElementById("list-" + id);
  var count = document.getElementById("count-" + id);

  section.hidden = items.length === 0;
  count.textContent = items.length;

  // Group by org — insert headers when the org changes
  var html = "";
  var lastOrg = null;
  var hasMultipleOrgs = false;
  for (var i = 0; i < items.length; i++) {
    var org = (items[i].pr.repository?.nameWithOwner ?? "").split("/")[0].toLowerCase();
    if (org !== lastOrg) {
      if (lastOrg !== null) hasMultipleOrgs = true;
      lastOrg = org;
    }
  }

  // Review Requested only: tier headers when more than one tier is present.
  // Org headers restart inside each tier.
  var tiers = {};
  if (id === "review-requested") {
    for (var k = 0; k < items.length; k++) tiers[items[k].tier || 3] = true;
  }
  var hasMultipleTiers = Object.keys(tiers).length > 1;
  var lastTier = null;

  lastOrg = null;
  for (var j = 0; j < items.length; j++) {
    var tier = items[j].tier || 3;
    if (hasMultipleTiers && tier !== lastTier) {
      html += '<div class="tier-group-header" data-tier="' + tier + '">' + escapeHtml(tierLabel(tier)) + '</div>';
      lastTier = tier;
      lastOrg = null;
    }
    var orgName = (items[j].pr.repository?.nameWithOwner ?? "").split("/")[0].toLowerCase();
    if (hasMultipleOrgs && orgName !== lastOrg) {
      var oc = getOrgColor(orgName, orgLookup, orgColorOverrides);
      html += '<div class="org-group-header" data-org="' + escapeAttr(orgName) + '">'
        + '<span class="org-group-dot" style="background:' + escapeAttr(oc.color) + '"></span>'
        + escapeHtml(orgName)
        + '</div>';
      lastOrg = orgName;
    }
    html += renderScoredCard(items[j], orgLookup, orgColorOverrides);
  }
  list.innerHTML = html;
}

function tierLabel(tier) {
  if (tier === 1) return t("tierNeedsYou");
  if (tier === 2) return t("tierTeamNeeds");
  return t("tierSettled");
}

function severityLevel(score) {
  if (score >= 40) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function renderScoredCard(item, orgLookup, orgColorOverrides) {
  var pr = item.pr;
  var repo = pr.repository?.nameWithOwner ?? "";
  var author = pr.author?.login ?? "unknown";
  var avatarUrl = pr.author?.avatarUrl ?? "";
  var age = timeAgo(pr.createdAt);
  var severity = severityLevel(item.score);

  var statusClass = "review-required";
  var statusText = t("statusReviewNeeded");
  if (pr.isDraft) {
    statusClass = "draft";
    statusText = t("statusDraft");
  } else if (pr.reviewDecision === "APPROVED") {
    statusClass = "approved";
    statusText = t("statusApproved");
  } else if (pr.reviewDecision === "CHANGES_REQUESTED") {
    statusClass = "changes-requested";
    statusText = t("statusChangesRequested");
  }

  // Review Requested column: the badge speaks to *you*. A PR nobody has
  // approved yet is highlighted; anything already settled is dimmed.
  var settled = false;
  if (item.context === "review-requested") {
    if (item.needsReview && pr.source === "teammates") {
      statusClass = "team-review";
      statusText = t("statusTeamReviewNeeded");
    } else if (item.needsReview) {
      statusClass = "needs-review";
      statusText = t("statusNeedsYourReview");
    } else if (!pr.isDraft) {
      settled = true;
    }
  }

  var orgName = repo.split("/")[0] || "";

  var safeUrl = isSafeUrl(pr.url) ? escapeAttr(pr.url) : "#";
  var safeAvatar = isSafeUrl(avatarUrl) ? escapeAttr(avatarUrl) : "";

  // -- Tags row (top) --
  var tagsHtml = '<div class="pr-badges">';
  if (orgName) {
    var oc = getOrgColor(orgName, orgLookup, orgColorOverrides);
    tagsHtml += '<span class="org-badge" style="background:' + escapeAttr(oc.bg) + ';color:' + escapeAttr(oc.color) + '">' + escapeHtml(orgName) + '</span>';
  }
  tagsHtml += '<span class="status-badge ' + escapeAttr(statusClass) + '">' + escapeHtml(statusText) + '</span>';
  tagsHtml += '</div>';

  // -- Card --
  var severityLabel = severity === "high" ? t("severityHigh") : severity === "medium" ? t("severityMedium") : t("severityLow");
  var html = '<div class="pr-card severity-' + severity + (settled ? " settled" : "") + '" data-org="' + escapeAttr(orgName.toLowerCase()) + '" data-tier="' + (item.tier || 3) + '">'
    + '<div class="severity-bar" aria-label="' + escapeAttr(severityLabel) + '"></div>'
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


// --- Org filters ---

function collectOrgs(scoredItems) {
  var seen = {};
  var orgs = [];
  for (var i = 0; i < scoredItems.length; i++) {
    var repo = scoredItems[i].pr.repository?.nameWithOwner ?? "";
    var org = repo.split("/")[0].toLowerCase();
    if (org && !seen[org]) {
      seen[org] = true;
      orgs.push(org);
    }
  }
  orgs.sort();
  return orgs;
}

function renderOrgFilters(orgs, orgLookup, orgColorOverrides) {
  var container = document.getElementById("org-filters");
  if (orgs.length <= 1) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  var html = '<button class="org-filter-pill active" data-filter="all" aria-pressed="true">' + escapeHtml(t("filterAll")) + '</button>';
  for (var i = 0; i < orgs.length; i++) {
    var oc = getOrgColor(orgs[i], orgLookup, orgColorOverrides);
    html += '<button class="org-filter-pill active" data-filter="' + escapeAttr(orgs[i]) + '" aria-pressed="true"'
      + ' style="--pill-color:' + escapeAttr(oc.color) + ';--pill-bg:' + escapeAttr(oc.bg) + '">'
      + escapeHtml(orgs[i]) + '</button>';
  }
  container.innerHTML = html;
  container.hidden = false;

  container.onclick = function (e) {
    var pill = e.target.closest(".org-filter-pill");
    if (!pill) return;

    var allPill = container.querySelector('[data-filter="all"]');
    var orgPills = container.querySelectorAll('.org-filter-pill:not([data-filter="all"])');

    if (pill.dataset.filter === "all") {
      // "All" is a toggle: everything on → turn everything off, otherwise turn everything on
      var activate = !allPillsActive(orgPills);
      orgPills.forEach(function (p) { setPillActive(p, activate); });
      setPillActive(allPill, activate);
    } else {
      setPillActive(pill, !pill.classList.contains("active"));
      // "All" reflects whether every org pill is on
      setPillActive(allPill, allPillsActive(orgPills));
    }

    applyOrgFilter();
  };
}

function setPillActive(pill, active) {
  pill.classList.toggle("active", active);
  pill.setAttribute("aria-pressed", active ? "true" : "false");
}

// True when every org pill is active (an empty list counts as all active)
function allPillsActive(pills) {
  var all = true;
  pills.forEach(function (p) { if (!p.classList.contains("active")) all = false; });
  return all;
}

function applyOrgFilter() {
  var container = document.getElementById("org-filters");
  var activePills = container.querySelectorAll('.org-filter-pill.active:not([data-filter="all"])');
  var activeOrgs = {};
  activePills.forEach(function (p) { activeOrgs[p.dataset.filter] = true; });
  var hasFilter = Object.keys(activeOrgs).length > 0;

  var cards = document.querySelectorAll(".pr-card");
  cards.forEach(function (card) {
    card.hidden = hasFilter ? !activeOrgs[card.dataset.org] : true;
  });

  // Hide/show org group headers based on filter
  document.querySelectorAll(".org-group-header").forEach(function (header) {
    header.hidden = hasFilter ? !activeOrgs[header.dataset.org] : true;
  });

  // Tier headers stay only while at least one of their cards is visible
  document.querySelectorAll(".tier-group-header").forEach(function (header) {
    var list = header.parentElement;
    header.hidden = !list || !list.querySelector('.pr-card[data-tier="' + header.dataset.tier + '"]:not([hidden])');
  });

  // Update counts and section visibility
  ["review-requested", "authored", "personal"].forEach(function (id) {
    var list = document.getElementById("list-" + id);
    var section = document.getElementById("section-" + id);
    var count = document.getElementById("count-" + id);
    var visible = list.querySelectorAll(".pr-card:not([hidden])").length;
    count.textContent = visible;
    section.hidden = visible === 0;
  });

  // Update empty state
  var totalVisible = document.querySelectorAll(".pr-card:not([hidden])").length;
  document.getElementById("empty-state").hidden = totalVisible > 0;
}

// --- Cache ---

/**
 * Returns { data, time, fresh } or null when nothing is cached.
 * Stale entries are returned too — the caller decides whether to refresh.
 * A cache written by a different account (username mismatch) is treated as absent.
 */
function getCachedData() {
  return storageGet(["dashboardCache", "dashboardCacheTime", "githubUsername"]).then(function (result) {
    if (!result.dashboardCache || !result.dashboardCacheTime) return null;
    if (result.githubUsername && result.dashboardCache.username !== result.githubUsername) return null;
    var age = Date.now() - result.dashboardCacheTime;
    return { data: result.dashboardCache, time: result.dashboardCacheTime, fresh: age < CACHE_TTL_MS };
  });
}

function cacheData(data, fetchedAt) {
  return storageSet({ dashboardCache: data, dashboardCacheTime: fetchedAt || Date.now() });
}

// --- Utilities ---

function friendlyError(err) {
  var msg = err.message || "";
  if (msg.indexOf("502") !== -1 || msg.indexOf("503") !== -1 || msg.indexOf("504") !== -1) {
    return t("errorGitHub");
  }
  if (msg.indexOf("429") !== -1) {
    return t("errorRateLimit");
  }
  if (msg.indexOf("401") !== -1) {
    return t("errorAuth");
  }
  if (msg.indexOf("403") !== -1 || msg.indexOf("INSUFFICIENT") !== -1 || msg.indexOf("FORBIDDEN") !== -1) {
    return t("errorScopes");
  }
  if (msg.indexOf("Failed to fetch") !== -1 || msg.indexOf("NetworkError") !== -1) {
    return t("errorNetwork");
  }
  return t("errorGeneric");
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function timeAgo(dateStr) {
  var date = new Date(dateStr);
  if (isNaN(date.getTime())) return t("timeUnknown");
  var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("timeJustNow");
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("timeMinAgo", minutes);
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return t("timeHourAgo", hours);
  var days = Math.floor(hours / 24);
  return t("timeDayAgo", days);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSafeUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.protocol === "https:" && SAFE_URL_HOSTS.test(parsed.hostname);
  } catch (e) {
    return false;
  }
}

// Escapes the five HTML-significant characters. Safe for both text nodes and
// double-quoted attribute values, so one function covers both uses.
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Kept as a named alias so call sites read as "this is an attribute value"
var escapeAttr = escapeHtml;

// --- Boot ---

watchForLogout();
init();
