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
[Read cache]            [Validate token against GitHub API]
       |                    |
   Any cache? ---> [Render cached data immediately]
       |                    |             |
   None         Fresh (<10 min)?    Stale, or Refresh clicked
       |             done                  |
       v                                   v
[Spinner] -----------> [Fetch from GitHub GraphQL API (2 parallel queries)]
                                           |
                              ok           |          error
                       +-------------------+-------------------+
                       v                                       v
          [Cache with timestamp → Score & sort → Render]   [Keep stale cards, show error banner]
```

The "Updated HH:MM" label always reflects when the data was fetched, not when the tab was opened.

## Dashboard Sections

1. **Review Requested** — Open PRs where you're a requested reviewer, plus open PRs authored by configured teammates. Ordered in three tiers with headers: needs your review (1), team needs a review (2), settled (3). Org grouping is kept inside each tier. Drafts, PRs approved by anyone, and PRs you already reviewed are tier 3.
2. **Your PRs** — All your open PRs with review decision and diff stats
3. **Personal Projects** — All open PRs in your repos and configured personal orgs (deduplicated against the other columns)

PRs are ranked within each column by an attention score (0-100) based on urgency signals: unresponded reviewer feedback, pending reviews, staleness, and changes requested. Draft PRs have their score halved.

When PRs span multiple orgs, a filter bar appears above the columns with clickable org pills. Toggling a pill hides/shows cards by `data-org` attribute without re-fetching data. The "All" pill toggles: if every org pill is active it deactivates them all, otherwise it activates them all, and it always mirrors whether every org pill is on.

## API Strategy

Up to three parallel GraphQL requests to avoid GitHub 502 timeouts on complex requests:
- **Core query**: `is:open is:pr review-requested:{username}` + `is:open is:pr author:{username}` — PRs needing your review and your own PRs
- **Personal query**: `is:open is:pr user:{username}` + one query per configured personal org — all open PRs in personal repos
- **Teammates query** (only when teammates are configured): `is:open is:pr org:acme author:a author:b archived:false`, repeated `org:` and `author:` qualifiers OR together within their kind. Names are packed greedily into as many search aliases as needed to keep every search string under GitHub's 256-character limit; the user's own login is dropped before querying. When teammate orgs are configured the result is also filtered client-side by repository owner. Results merge into Review Requested; a PR returned by both searches, or naming the user under `reviewRequests`, counts as requested

Each search is capped at 50 results (no pagination). Authored PRs also fetch review threads for the "unresponded feedback" signal; review-requested PRs fetch prior reviews and outstanding review requests for the "pending review" signal. Nothing else is requested — unused fields cost rate-limit points.

Results are cached client-side for 10 minutes. After that the cache is served stale while a background refresh runs (stale-while-revalidate), so a new tab never waits on the network once it has data. Only one refresh runs per page at a time, and it is tied to the token that started it. Logout is defended three ways: the in-flight refresh re-checks the stored token before writing, the cache records its owner and is ignored when it does not match the logged-in username, and a `storage.onChanged` listener reloads every dashboard tab when the token is removed.

## i18n

All user-facing strings go through a `t(key, ...subs)` helper defined at the top of `github.js`. It uses `chrome.i18n.getMessage()` (or `browser.i18n.getMessage()` on Firefox) which reads from `_locales/{lang}/messages.json`. The browser picks the locale automatically.

Static strings in `newtab.html` use `data-i18n`, `data-i18n-tooltip`, `data-i18n-placeholder`, and `data-i18n-aria` attributes, hydrated on load by `translatePage()`. Dynamic strings in JS use `t()` directly.

Three locales ship: English, Italian, Polish. Adding a language requires only a new `_locales/xx/messages.json` file.

## Design Decisions

- **Logout uses a confirmation modal** rather than `window.confirm()` — Firefox extension pages do not support `window.confirm`.
- **401 during dashboard load shows an error banner** — tells the user to clear the token via the logout button and set up a new one.
- **Classic PATs recommended over fine-grained** — fine-grained tokens may not see org repos unless the org admin has enabled them, which caused beta tester confusion. The trade-off (`repo` grants write access) is stated on the setup screen and in docs/security.md.
- **Stale cache beats a spinner** — once the 10-minute TTL passes, the old dashboard renders immediately and refreshes in the background. A failed refresh keeps the old cards and shows the error banner, rather than an empty page.
- **Re-requested reviews count as pending** — a PR that still lists you under `reviewRequests` after you reviewed means someone re-requested you, so it scores +25 again. Team requests only count until you have submitted a review.
- **One approval settles a review request** — in the Review Requested column, a PR with an approval from anyone (`reviewDecision` or any `APPROVED` review) gets no pending bonus and is rendered dimmed; PRs nobody has approved get a highlighted "Needs your review" badge. Assumes a one-approval policy; repos requiring more approvals will look settled early.
- **Teammates live in Review Requested, not a fourth column** — one place to look, ordered by tier. "Teammates" is a hand-maintained list of logins (`teammates` storage key, validated against GitHub login rules, cleared on logout); there is no GitHub team involved. A teammate's un-approved PR scores +15 (`TEAM_REVIEW`) versus +25 for an explicit request, so requests still win within a tier boundary and older teammate PRs rise within their org.
- **No `connect-src` in the CSP** — Firefox enforces it for extension pages and blocked API calls on reload; Chrome ignores it. Network scope is enforced in code (single hard-coded endpoint) instead.
