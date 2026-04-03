# Changelog

## Unreleased

- Add org filter bar to toggle PR visibility by organisation
- Add GitHub Actions workflow to build extension zip on tag push
- Add ESLint config and dev dependency
- Add attention score engine ranking PRs 0-100 by urgency signals
- Add 10-minute client-side cache to reduce API calls
- Add light/dark/system theme support with settings picker
- Add settings modal for work/personal org configuration
- Add "Personal Projects" column for PRs in user's own repos and orgs
- Add cross-browser support (Chrome + Firefox)
- Remove dead `ciStatus` code path (data was never fetched)
- Commit `package-lock.json` for reproducible CI builds
- Initial release: new tab dashboard with Review Requested, Your PRs, and Personal Projects columns
