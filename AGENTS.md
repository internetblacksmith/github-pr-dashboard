# GitHub PR Dashboard

Chrome extension that replaces the new tab page with a GitHub PR dashboard showing review requests, unresponded comments, and open PRs.

## Build Commands

```bash
make test       # Run Vitest unit tests
make lint       # Run ESLint
make build      # Create distributable zip
make ci         # Run lint + test + build (mirrors CI pipeline)
make install    # Install dev dependencies
```

## Critical Rules

- Pin dependencies to exact versions
- Keep docs updated with every code change — this includes README.md, docs/store-listing.md (Chrome Web Store), and docs/architecture.md
- Keep Makefile updated - add new tasks as project evolves
- Token stored in `chrome.storage.local` (not `sync`) — never leaves the device
- No external CDN dependencies — everything must work offline after install

## Detailed Guides

| Topic | Guide |
|-------|-------|
| Architecture   | [docs/architecture.md](docs/architecture.md)   |
| Security       | [docs/security.md](docs/security.md)           |
| Store Listing  | [docs/store-listing.md](docs/store-listing.md) |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
