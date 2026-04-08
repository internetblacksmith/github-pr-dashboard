# GitHub PR Dashboard

A Chrome/Firefox extension that replaces your new tab page with a dashboard of your GitHub pull requests. See what needs your attention at a glance — no clicking through notifications.

## What it does

Every new tab shows three columns:

- **Review Requested** — PRs where someone asked for your review
- **Your PRs** — PRs you opened, with review status and diff stats
- **Personal Projects** — All open PRs across your repos and orgs

Each PR is ranked by an **attention score** (0-100) based on urgency signals:

| Signal | Weight |
|--------|--------|
| Unresponded reviewer feedback | +30 |
| Pending review you haven't started | +25 |
| Stale (>24h / >48h / >72h) | +5 / +10 / +15 |
| Changes requested on your PR | +10 |
| Draft PR | x0.5 |

A coloured severity bar on each card tells you where to look first: red (act now), orange (on your radar), grey (all clear).

When PRs span multiple orgs, a **filter bar** lets you toggle visibility by organisation.

## Install

Three ways to install, depending on what you have:

### From a release zip

Grab the latest `github-pr-dashboard.zip` from the [Releases page](https://github.com/internetblacksmith/github-pr-dashboard/releases) and unzip it somewhere you'll keep it.

**Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the unzipped folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from the unzipped folder

### From source (no build step)

Clone the repo and load it directly — no dependencies needed to just run the extension:

```bash
git clone https://github.com/internetblacksmith/github-pr-dashboard.git
cd github-pr-dashboard
```

Then follow the same "Load unpacked" / "Load Temporary Add-on" steps above, pointing to the cloned folder.

### Build your own zip

If you want to create your own distributable zip:

```bash
git clone https://github.com/internetblacksmith/github-pr-dashboard.git
cd github-pr-dashboard
make install    # installs dev dependencies (for tests/lint only)
make build      # creates github-pr-dashboard.zip
```

The build excludes tests, lint config, and dev files. Load the zip the same way as a release zip.

> **Note:** Firefox "Load Temporary Add-on" installs are removed when you close the browser. For a persistent install on Firefox, you'll need a signed build from [addons.mozilla.org](https://addons.mozilla.org).

## Setup

On first new tab, you'll be prompted to paste a GitHub token.

**Option A — Fine-grained token (recommended):**
1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. Grant **Pull requests** (read) access on **All repositories**
3. Paste the token

**Option B — Classic token:**
1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new?description=GitHub%20PR%20Dashboard&scopes=repo)
2. Check the `repo` scope
3. Paste the token

## Settings

Click the gear icon to configure:

- **Personal organisations** — add orgs to see all their open PRs in the Personal Projects column. Drag to reorder — PRs are grouped by org in this order. Work orgs don't need to be here; your authored and review-requested PRs show up automatically. Orgs not in this list appear last, sorted alphabetically.
- **Org colours** — customise badge colours for any org on the dashboard. Orgs in the personal list get their picker inline; other orgs appear in a separate section below.
- **Theme** — Light, Dark, or System (follows OS preference).

## Architecture

No build step, no framework, no external CDN. Vanilla HTML/CSS/JS for instant load times. The token stays in `chrome.storage.local` and never leaves your device. Network is restricted to `api.github.com` only.

See [docs/architecture.md](docs/architecture.md) and [docs/security.md](docs/security.md) for details.

## Development

```bash
make install    # Install dev dependencies
make test       # Run tests (Vitest)
make lint       # Run ESLint
make build      # Create distributable zip
make ci         # All of the above
```

## License

MIT
