# Security Model

## Token Storage

The GitHub PAT is stored in `chrome.storage.local` — the standard approach used by Octotree, Refined GitHub, and other major GitHub extensions.

- **`chrome.storage.local`** (not `sync`) — token stays on-device, never synced to Google servers
- **Sandboxed per-extension** — other extensions and websites cannot access it
- **No encryption** — consistent with industry practice; if an attacker has access to extension storage, they already have full browser access

## Minimal Permissions

- Extension only requests `storage` permission
- No `tabs`, `history`, `cookies`, or broad host permissions
- `host_permissions` covers only `https://api.github.com/*`. Note that in MV3 this grants access; it does not block other hosts. What keeps the token on GitHub is the code: `github.js` hard-codes the GraphQL endpoint and nothing else makes a network request (avatars are plain `<img>` loads from GitHub hosts)
- Token should be a classic PAT with `repo` scope — the setup screen links directly to the creation URL with the scope pre-filled

## Token Scope

`repo` is the only classic scope that can read private repositories, and it also grants write access — GitHub has no read-only classic scope. The extension only sends GraphQL `search` and `viewer` queries, but a stolen token could do more. Mitigations:

- The setup screen and README say this plainly and point users with public-only needs to `public_repo`
- Fine-grained tokens are read-only but require org-admin opt-in, which is why they are not the default (see docs/architecture.md)
- The token is only ever sent in an `Authorization` header to `api.github.com`, never logged, never put in a URL, and cleared on logout together with the cache
- Logging into a different account cannot show the previous account's PRs: the setup form clears the cache, `getCachedData()` rejects a cache whose `username` differs from the stored login, an in-flight background refresh re-checks the token before writing and is keyed by token, and removing the token from storage reloads every open dashboard tab

## Content Security Policy

Declared explicitly in `manifest.json` under `content_security_policy.extension_pages`:

```
script-src 'self'; object-src 'none'
```

- No inline scripts
- No external JavaScript
- `connect-src` is deliberately absent: Firefox enforces it for extension pages and it blocked `fetch` to the API on reload, while Chrome ignores it. Network scope is enforced in code instead (see above)

## XSS Prevention

- All API string values escaped via `escapeHtml()` / `escapeAttr()` before innerHTML insertion
- Numeric values coerced to integers before rendering
- PR links and avatar URLs must be `https:` on `github.com` or `*.githubusercontent.com` (`isSafeUrl()`), otherwise they are dropped
- Error messages sanitized — no raw API responses shown to the user

## Supply Chain

- Dev dependencies pinned to exact versions, installed with `npm ci` from the committed lockfile
- `web-ext` (used to build the Firefox xpi) is a pinned dev dependency, run with `npx --no-install` so releases never fetch an unpinned package
- GitHub Actions pinned to full commit SHAs; workflows run with `contents: read` and only the release job gets `contents: write`; checkout uses `persist-credentials: false`
- Dependabot watches both npm and GitHub Actions weekly, grouped into one PR per ecosystem
- Dependabot PRs for patch and minor updates are auto-merged once the required `build` check passes (`.github/workflows/dependabot-auto-merge.yml`); major updates wait for a human
