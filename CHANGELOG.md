# Changelog

## Unreleased

- Add i18n with English, Italian, and Polish translations
- Add accessibility: ARIA labels, focus trap, keyboard nav, focus-visible outlines
- Add logout confirmation modal (replaces double-click, works in Firefox)
- Improve error messages for 401 and permission errors
- Add password manager autofill support on setup input
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
- Simplify setup to classic PAT with `repo` scope (drop fine-grained option)
- Remove dead code (ciStatus, scoreAll, needsResponse, duplicate functions)
- Fix escapeHtml to use regex instead of throwaway DOM nodes
- Fix Escape key listener stacking
- Commit package-lock.json for reproducible CI builds
