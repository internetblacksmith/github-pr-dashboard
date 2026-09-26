# Changelog

## Unreleased

- Settings modal now has a section nav (Organisations, Teammates, Appearance) with a scrolling pane and a pinned Save button, so long org or teammate lists no longer grow the modal past the screen
- Add a Teammates list in Settings; teammates’ open PRs join the Review Requested column, which is now ordered in three tiers with headers: needs your review, team needs a review, settled
- Teammates’ PRs can be limited to your company’s organisations ("Only in these organisations"); empty means any repository
- Fix requested draft PRs getting a "Needs your review" badge
- Highlight review requests nobody has approved yet with a "Needs your review" badge; dim requests already approved by anyone or already reviewed by you, and stop scoring them as pending
- Make the **All** filter pill a toggle: clears every org when all are selected, selects every org otherwise
- Show the cached dashboard instantly and refresh in the background once the 10-minute cache expires; a failed refresh keeps the last good data on screen
- Logging out clears rendered PRs, reloads other open dashboard tabs, and a cache from a different account is never shown
- Fix "Updated at" showing the tab-open time instead of when the data was fetched
- Score re-requested reviews as pending (+25) instead of treating them as already reviewed
- Drop unused `mergeable` and `reviews` fields from the authored PR query
- Restrict PR links and avatars to `https` on github.com / githubusercontent.com
- Explain on the setup screen and in docs that the `repo` scope grants write access, and suggest `public_repo` for public-only use
- Fix permission error messages that still described fine-grained token settings
- Pin `web-ext` as an exact dev dependency instead of fetching the latest at release time
- Firefox xpi no longer packs empty `demo/`, `docs/`, `test/` folders or the SVG icon sources
- Pin GitHub Actions to commit SHAs, add least-privilege `permissions`, disable credential persistence in checkout
- Add Dependabot for npm and GitHub Actions, grouped weekly, with auto-merge of patch and minor updates once CI passes
- Validate the version string in `make release` and `make tag`
- Bump ESLint and Vitest, resolve `npm audit` findings
- Add tests for GraphQL retries and timeouts, personal PR dedup, column sorting, card rendering, cache freshness, and re-requested reviews
- Correct docs that described `host_permissions` as a network restriction

## 1.0.3 - 2026-04-11

- Split CI and release into separate workflows
- Update `make release` for the PR-only workflow, add `make tag`
- Remove password manager autofill references
- Bump vite (Dependabot)

## 1.0.2 - 2026-04-09

- Add Firefox xpi build to the release workflow (unsigned)
- Rename the build zip to `github-pr-dashboard-chrome.zip`

## 1.0.1 - 2026-04-09

- Simplify setup to a classic PAT with `repo` scope (drop the fine-grained option)
- Add logout confirmation modal (replaces double-click, works in Firefox)
- Improve error messages for 401 and permission errors
- Prefill token name and scope in the GitHub token creation link
- Remove `connect-src` from the CSP for Firefox compatibility
- Update all docs to match the codebase

## 1.0.0 - 2026-04-08

- Add i18n with English, Italian, and Polish translations
- Add accessibility: ARIA labels, focus trap, keyboard nav, focus-visible outlines
- Add `make release` with interactive version bump menu
- Add `make demo` for screenshot-ready extension builds with mock data
- Add privacy policy (PRIVACY.md)
- Add Firefox data collection declaration (`required: ["none"]`)
- Add Chrome Web Store listing (docs/store-listing.md)
- Add per-org configurable colours with hash-based defaults
- Add org filter bar to toggle PR visibility by organisation
- Add org group headers within columns
- Add promote button (+) on discovered orgs in settings
- Add keyboard reorder buttons (up/down) for org rows in settings
- Add custom CSS tooltips replacing native title attributes
- Add column help tooltips (?) with hover descriptions
- Add enriched setup screen with feature highlights and privacy note
- Add extension icons (SVG source + 16/48/128 PNG)
- Add explicit CSP to manifest (script-src, object-src)
- Add GitHub Actions workflow for tag-triggered releases
- Add ESLint config and dev dependency
- Remove dead code (ciStatus, scoreAll, needsResponse, duplicate functions)
- Fix escapeHtml to use regex instead of throwaway DOM nodes
- Fix Escape key listener stacking
- Commit package-lock.json for reproducible CI builds
