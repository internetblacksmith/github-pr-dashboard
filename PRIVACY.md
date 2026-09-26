# Privacy Policy

**GitHub PR Dashboard** is a browser extension that replaces your new tab page with a GitHub pull request dashboard.

## Data Collection

This extension **does not collect, transmit, or store any personal data** on external servers. There is no analytics, no telemetry, and no tracking of any kind.

## GitHub Token

Your GitHub Personal Access Token is stored locally on your device using `chrome.storage.local` (or `browser.storage.local` on Firefox). It is:

- **Never synced** to any cloud service (we use `local`, not `sync` storage)
- **Never transmitted** anywhere except directly to the GitHub API (`api.github.com`)
- **Never shared** with other extensions, websites, or third parties
- **Deleted immediately** when you log out via the extension, together with the cached dashboard data

## Network Requests

The extension makes API requests only to `https://api.github.com` to fetch your pull request data. The only other network activity is loading avatar images from GitHub (`*.githubusercontent.com`), which happens as ordinary `<img>` loads and never carries your token. The API endpoint is hard-coded in the extension source; no other hosts are contacted.

## Permissions

- **storage** — to save your token, preferences, and cached dashboard data locally
- **host_permissions (api.github.com)** — to fetch PR data from the GitHub GraphQL API. Note that this grants access to that host; the restriction to GitHub only is enforced by the extension code, not by the browser

No other permissions are requested. The extension cannot access your browsing history, tabs, cookies, or any other browser data.

## Third-Party Services

The only third-party service accessed is the [GitHub API](https://docs.github.com/en/rest). Your use of the GitHub API is subject to [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Changes

If this policy changes, the update will be published in this file and included in the extension's release notes.

## Contact

For questions about this privacy policy, open an issue at [github.com/internetblacksmith/github-pr-dashboard](https://github.com/internetblacksmith/github-pr-dashboard/issues).
