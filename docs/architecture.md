# Architecture

## Overview

A Chrome Manifest V3 extension that overrides the new tab page with a GitHub PR dashboard. No build step, no framework — vanilla HTML/CSS/JS for instant load times.

## File Structure

```
manifest.json       Chrome/Firefox extension manifest (MV3)
github.js           GitHub GraphQL API client + i18n t() helper
score.js            Attention score engine — ranks PRs 0-100 by urgency
newtab.html         New tab page markup
newtab.css          Styles (light/dark/system themes)
newtab.js           Page controller — auth flow, caching, rendering
_locales/           i18n message files (en, it, pl)
icons/              Extension icons (SVG source + 16/48/128 PNG)
docs/               Documentation
test/               Vitest unit tests
demo/               Demo github.js stub for screenshot builds
```

## Data Flow

```
[New Tab Opened]
       |
       v
[Check chrome.storage.local for token]
       |
   No token? --> [Setup screen: paste classic PAT with repo scope]
       |                    |
       v                    v
[Check 10-min cache]    [Validate token against GitHub API]
       |                    |
   Expired? ----+           v
       |        |     [Store token in chrome.storage.local]
       v        v
[Fetch from GitHub GraphQL API (2 parallel queries)]
       |
       v
[Cache response for 10 min]
       |
       v
[Score & sort PRs by urgency → Render 3-column dashboard]
```

## Dashboard Sections

1. **Review Requested** — Open PRs where you're a requested reviewer
2. **Your PRs** — All your open PRs with review decision and diff stats
3. **Personal Projects** — All open PRs in your repos and configured personal orgs (deduplicated against the other columns)

PRs are ranked within each column by an attention score (0-100) based on urgency signals: unresponded reviewer feedback, pending reviews, staleness, and changes requested. Draft PRs have their score halved.

When PRs span multiple orgs, a filter bar appears above the columns with clickable org pills. Toggling a pill hides/shows cards by `data-org` attribute without re-fetching data.

## API Strategy

Two parallel GraphQL queries to avoid GitHub 502 timeouts on complex requests:
- **Core query**: `is:open is:pr review-requested:{username}` + `is:open is:pr author:{username}` — PRs needing your review and your own PRs
- **Personal query**: `is:open is:pr user:{username}` + one query per configured personal org — all open PRs in personal repos

Results are cached client-side for 10 minutes to avoid hitting the API on every new tab.

## i18n

All user-facing strings go through a `t(key, ...subs)` helper defined at the top of `github.js`. It uses `chrome.i18n.getMessage()` (or `browser.i18n.getMessage()` on Firefox) which reads from `_locales/{lang}/messages.json`. The browser picks the locale automatically.

Static strings in `newtab.html` use `data-i18n`, `data-i18n-tooltip`, `data-i18n-placeholder`, and `data-i18n-aria` attributes, hydrated on load by `translatePage()`. Dynamic strings in JS use `t()` directly.

Three locales ship: English, Italian, Polish. Adding a language requires only a new `_locales/xx/messages.json` file.

## Design Decisions

- **Logout uses a confirmation modal** rather than `window.confirm()` — Firefox extension pages do not support `window.confirm`.
- **401 during dashboard load shows an error banner** — tells the user to clear the token via the logout button and set up a new one.
- **Classic PATs recommended over fine-grained** — fine-grained tokens may not see org repos unless the org admin has enabled them, which caused beta tester confusion.
