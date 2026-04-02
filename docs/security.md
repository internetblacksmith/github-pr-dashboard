# Security Model

## Token Storage

The GitHub PAT is stored in `chrome.storage.local` — the standard approach used by Octotree, Refined GitHub, and other major GitHub extensions.

- **`chrome.storage.local`** (not `sync`) — token stays on-device, never synced to Google servers
- **Sandboxed per-extension** — other extensions and websites cannot access it
- **No encryption** — consistent with industry practice; if an attacker has access to extension storage, they already have full browser access

## Minimal Permissions

- Extension only requests `storage` permission
- No `tabs`, `history`, `cookies`, or broad host permissions
- CSP restricts network to `https://api.github.com` only
- GitHub token should use fine-grained PAT with read-only PR/Issues access

## Content Security Policy

```
script-src 'self'; object-src 'none'; connect-src https://api.github.com
```

- No inline scripts
- No external JavaScript
- Network restricted to GitHub API only

## XSS Prevention

- All API string values escaped via `escapeHtml()` / `escapeAttr()` before innerHTML insertion
- Numeric values coerced to integers before rendering
- Error messages sanitized — no raw API responses shown to the user
