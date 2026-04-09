.DEFAULT_GOAL := menu
.PHONY: menu install test lint ci build demo release help list

# Colors
CYAN    := \033[36m
GREEN   := \033[32m
YELLOW  := \033[33m
DIM     := \033[2m
BOLD    := \033[1m
RESET   := \033[0m

menu:
	@printf "\n"
	@printf "$(BOLD)$(CYAN)╔══════════════════════════════════════════════════════════════╗$(RESET)\n"
	@printf "$(BOLD)$(CYAN)║          GitHub PR Dashboard - Command Menu                 ║$(RESET)\n"
	@printf "$(BOLD)$(CYAN)╚══════════════════════════════════════════════════════════════╝$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== Development ===$(RESET)\n"
	@printf "   $(YELLOW)1)$(RESET)  make lint              $(DIM)Run ESLint$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== Testing ===$(RESET)\n"
	@printf "   $(YELLOW)2)$(RESET)  make test              $(DIM)Run all tests$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== Build & Deploy ===$(RESET)\n"
	@printf "   $(YELLOW)3)$(RESET)  make build             $(DIM)Create distributable zip$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== Setup ===$(RESET)\n"
	@printf "   $(YELLOW)4)$(RESET)  make install           $(DIM)Install dev dependencies$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== CI ===$(RESET)\n"
	@printf "   $(YELLOW)5)$(RESET)  make ci                $(DIM)Run lint + test + build (CI pipeline)$(RESET)\n"
	@printf "\n"
	@printf "  $(BOLD)$(GREEN)=== Release ===$(RESET)\n"
	@printf "   $(YELLOW)6)$(RESET)  make release           $(DIM)Bump version and create PR$(RESET)\n"
	@printf "   $(YELLOW)7)$(RESET)  make tag               $(DIM)Tag merged release and push$(RESET)\n"
	@printf "   $(YELLOW)8)$(RESET)  make demo              $(DIM)Build demo extension for screenshots$(RESET)\n"
	@printf "\n"
	@read -p "  Enter choice: " choice; \
	case $$choice in \
		1) $(MAKE) lint ;; \
		2) $(MAKE) test ;; \
		3) $(MAKE) build ;; \
		4) $(MAKE) install ;; \
		5) $(MAKE) ci ;; \
		6) $(MAKE) release ;; \
		7) $(MAKE) tag ;; \
		8) $(MAKE) demo ;; \
		*) echo "Invalid choice" ;; \
	esac

install:
	npm install

test:
	npm test

lint:
	npx eslint --no-warn-ignored *.js

ci: lint test build

build:
	@rm -f github-pr-dashboard-chrome.zip
	zip -r github-pr-dashboard-chrome.zip manifest.json *.html *.css *.js icons/ _locales/ -x "node_modules/*" "*.svg" "package*.json" "eslint.config.*" "test/*" "demo/*"

demo:
	@rm -rf demo-build
	@mkdir -p demo-build
	@cp manifest.json newtab.html newtab.css newtab.js score.js demo-build/
	@cp demo/github.js demo-build/github.js
	@cp -r icons _locales demo-build/
	@printf "\n$(BOLD)$(GREEN)Demo extension built in demo-build/$(RESET)\n\n"
	@printf "  Load it in Chrome:\n"
	@printf "    1. Open $(CYAN)chrome://extensions$(RESET)\n"
	@printf "    2. Enable $(CYAN)Developer mode$(RESET)\n"
	@printf "    3. Click $(CYAN)Load unpacked$(RESET) and select $(CYAN)demo-build/$(RESET)\n"
	@printf "    4. Open a new tab and screenshot\n\n"

release:
	@CURRENT=$$(node -p "require('./package.json').version"); \
	MAJOR=$$(echo $$CURRENT | cut -d. -f1); \
	MINOR=$$(echo $$CURRENT | cut -d. -f2); \
	PATCH=$$(echo $$CURRENT | cut -d. -f3); \
	NEXT_PATCH="$$MAJOR.$$MINOR.$$((PATCH + 1))"; \
	NEXT_MINOR="$$MAJOR.$$((MINOR + 1)).0"; \
	NEXT_MAJOR="$$((MAJOR + 1)).0.0"; \
	printf "\n$(BOLD)Current version: $(CYAN)$$CURRENT$(RESET)\n\n"; \
	printf "  $(YELLOW)1)$(RESET)  $$NEXT_PATCH    $(DIM)patch$(RESET)\n"; \
	printf "  $(YELLOW)2)$(RESET)  $$NEXT_MINOR    $(DIM)minor$(RESET)\n"; \
	printf "  $(YELLOW)3)$(RESET)  $$NEXT_MAJOR    $(DIM)major$(RESET)\n"; \
	printf "  $(YELLOW)4)$(RESET)  custom\n\n"; \
	read -p "  Choose [1]: " BUMP; \
	case "$${BUMP:-1}" in \
		1) VERSION=$$NEXT_PATCH ;; \
		2) VERSION=$$NEXT_MINOR ;; \
		3) VERSION=$$NEXT_MAJOR ;; \
		4) read -p "  Version: " VERSION ;; \
		*) echo "Aborted."; exit 1 ;; \
	esac; \
	if [ -z "$$VERSION" ]; then echo "Aborted."; exit 1; fi; \
	printf "\n$(BOLD)Releasing $(CYAN)v$$VERSION$(RESET)\n\n"; \
	BRANCH="release/v$$VERSION"; \
	git checkout -b "$$BRANCH"; \
	node -e "var p=require('./package.json');p.version='$$VERSION';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"; \
	sed -i 's/"version": ".*"/"version": "'"$$VERSION"'"/' manifest.json; \
	$(MAKE) ci; \
	git add package.json manifest.json; \
	git commit -m "Release v$$VERSION"; \
	git push -u origin "$$BRANCH"; \
	gh pr create --title "Release v$$VERSION" --body "Bump version to $$VERSION" --base main; \
	printf "\n$(BOLD)$(GREEN)PR created for v$$VERSION$(RESET)\n"; \
	printf "  After merging, run: $(CYAN)make tag VERSION=$$VERSION$(RESET)\n\n"

tag:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make tag VERSION=x.y.z"; exit 1; fi
	@git checkout main
	@git pull
	@git tag "v$(VERSION)"
	@git push --tags
	@printf "\n$(BOLD)$(GREEN)Tagged v$(VERSION) — GitHub Actions will create the release.$(RESET)\n"

help:
	@printf "\n"
	@printf "$(BOLD)Available commands:$(RESET)\n"
	@printf "\n"
	@printf "  $(CYAN)make test$(RESET)              Run all tests\n"
	@printf "  $(CYAN)make lint$(RESET)              Run ESLint\n"
	@printf "  $(CYAN)make build$(RESET)             Create distributable zip\n"
	@printf "  $(CYAN)make install$(RESET)           Install dev dependencies\n"
	@printf "  $(CYAN)make ci$(RESET)                Run lint + test + build\n"
	@printf "  $(CYAN)make release$(RESET)           Bump version and create PR\n"
	@printf "  $(CYAN)make tag$(RESET)               Tag merged release and push\n"
	@printf "  $(CYAN)make demo$(RESET)              Build demo extension for screenshots\n"
	@printf "\n"

list: help
