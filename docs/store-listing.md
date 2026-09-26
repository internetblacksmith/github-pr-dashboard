# Chrome Web Store Listing

Keep this file in sync with the README and the extension itself.
Update it whenever features change.

## Name

GitHub PR Dashboard

## Summary (132 chars max)

Replace your new tab with a GitHub PR dashboard. See review requests, your PRs, and personal projects — ranked by what needs attention.

## Description

Every new tab shows your GitHub pull requests in three columns:

- Review Requested — PRs where someone asked for your review, plus your teammates’ open PRs, grouped into needs your review / team needs a review / settled
- Your PRs — PRs you opened, with review status and diff stats
- Personal Projects — all open PRs across your repos and configured orgs

Each PR gets an attention score (0-100) based on urgency: unresponded reviewer feedback, pending reviews you haven't started, stale PRs, and changes requested. A coloured severity bar on each card shows what to look at first.

Features:

- Attention scoring — PRs ranked by urgency, not just recency
- Teammates — list the people you review for and their un-reviewed PRs surface even when nobody asked you
- Org filtering — toggle visibility by organisation when PRs span multiple orgs
- Org grouping — PRs grouped by org with drag-to-reorder in settings
- Customisable org colours — auto-assigned from org name, fully overridable
- Light, dark, and system themes
- Instant new tabs — cached dashboard shows immediately and refreshes in the background
- Works offline after install — no external CDN dependencies
- Cross-browser — Chrome and Firefox
- Available in English, Italian, and Polish

Privacy:

- Your GitHub token stays on your device (chrome.storage.local, never synced)
- Only permission requested is storage — no tabs, history, or cookies access
- Only talks to api.github.com — no analytics, no third-party requests
- Classic personal access token with `repo` scope is all you need — the setup screen links directly to the token creator with the scope pre-filled (`public_repo` works if you only need public repositories)

Setup takes 30 seconds: create a GitHub token with `repo` scope (link pre-filled), paste it on the first new tab, done.

Open source: https://github.com/internetblacksmith/github-pr-dashboard

## Category

Developer Tools

## Language

English
