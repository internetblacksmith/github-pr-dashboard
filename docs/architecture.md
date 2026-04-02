# Architecture

## Overview

A Chrome Manifest V3 extension that overrides the new tab page with a GitHub PR dashboard. No build step, no framework — vanilla HTML/CSS/JS for instant load times.

## File Structure

```
manifest.json       Chrome extension manifest (MV3)
github.js           GitHub GraphQL API client
newtab.html         New tab page markup
newtab.css          Styles (GitHub dark theme)
newtab.js           Page controller — orchestrates auth flow and rendering
icons/              Extension icons
docs/               Documentation
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
[Check 2-min cache]     [Validate token against GitHub API]
       |                    |
   Expired? ----+           v
       |        |     [Store token in chrome.storage.local]
       v        v
[Fetch from GitHub GraphQL API]
       |
       v
[Cache response for 2 min]
       |
       v
[Render dashboard: 3 sections]
```

## Dashboard Sections

1. **Needs Your Response** — Your PRs with unresolved review threads where you're not the last commenter
2. **Review Requested** — Open PRs where you're a requested reviewer
3. **Your Open PRs** — All your open PRs with CI status, review decision, and diff stats

## API Strategy

Single GraphQL query fetches everything. Two search queries in one request:
- `is:open is:pr review-requested:{username}` — PRs needing your review
- `is:open is:pr author:{username}` — Your own PRs

The "needs response" list is derived client-side by filtering authored PRs that have unresolved review threads where someone else commented last.
