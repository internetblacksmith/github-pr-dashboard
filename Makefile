.DEFAULT_GOAL := menu

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
	@read -p "  Enter choice: " choice; \
	case $$choice in \
		1) $(MAKE) lint ;; \
		2) $(MAKE) test ;; \
		3) $(MAKE) build ;; \
		4) $(MAKE) install ;; \
		*) echo "Invalid choice" ;; \
	esac

install:
	npm install

test:
	npm test

lint:
	npx eslint *.js

build:
	@rm -f github-pr-dashboard.zip
	zip -r github-pr-dashboard.zip manifest.json *.html *.css *.js icons/ -x "node_modules/*" "*.svg" "package*.json" ".eslintrc*" "test/*"

help:
	@printf "\n"
	@printf "$(BOLD)Available commands:$(RESET)\n"
	@printf "\n"
	@printf "  $(CYAN)make test$(RESET)              Run all tests\n"
	@printf "  $(CYAN)make lint$(RESET)              Run ESLint\n"
	@printf "  $(CYAN)make build$(RESET)             Create distributable zip\n"
	@printf "  $(CYAN)make install$(RESET)           Install dev dependencies\n"
	@printf "\n"

list: help
