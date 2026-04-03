# Architecture

## Overview

A Chrome Manifest V3 extension that overrides the new tab page with a GitHub PR dashboard. No build step, no framework — vanilla HTML/CSS/JS for instant load times.

## File Structure

```
manifest.json       Chrome/Firefox extension manifest (MV3)
github.js           GitHub GraphQL API client
score.js            Attention score engine — ranks PRs 0-100 by urgency
newtab.html         New tab page markup
newtab.css          Styles (light/dark/system themes)
newtab.js           Page controller — auth flow, caching, rendering
icons/              Extension icons
docs/               Documentation
test/               Vitest unit tests
```

## Data Flow

```
[New Tab Opened]
       |
       v
[Check chrome.storage.local for token]
       |
   No token? --> [Setup screen: paste token]
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
