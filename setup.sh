#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "============================================="
echo "       QA Tools — Project Setup"
echo "============================================="
echo ""

# -- Node version check ------------------------------------------------
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js not found. Install Node.js >=20 first.${NC}"
    echo "  Recommended: https://github.com/nvm-sh/nvm#installing-and-updating"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
echo -e "  Node:   $(node -v)${NC}"

if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}ERROR: Node.js >=20 required. Found: $(node -v)${NC}"
    exit 1
fi

# -- nvm use if available -----------------------------------------------
if [ -f .nvmrc ] && command -v nvm &> /dev/null; then
    nvm use 2>/dev/null || echo -e "${YELLOW}  nvm: version mismatch — check .nvmrc${NC}"
fi

# -- npm version --------------------------------------------------------
NPM_VERSION=$(npm -v | cut -d. -f1)
echo -e "  npm:    $(npm -v)${NC}"
echo ""

# -- Dependencies -------------------------------------------------------
echo "--- Installing dependencies (npm ci) ---"
npm ci
echo -e "${GREEN}  Done.${NC}"
echo ""

# -- Git hooks ----------------------------------------------------------
echo "--- Configuring git hooks ---"
git config core.hooksPath .githooks
if [ -f .githooks/pre-push ]; then
    chmod +x .githooks/pre-push
fi
echo -e "${GREEN}  Hooks installed (pre-push: typecheck + tests).${NC}"
echo ""

# -- Typecheck ----------------------------------------------------------
echo "--- Running typecheck ---"
npx tsc --noEmit
echo -e "${GREEN}  Typecheck passed.${NC}"
echo ""

# -- Environment file ---------------------------------------------------
if [ ! -f .env ]; then
    echo -e "${YELLOW}--- No .env file found ---${NC}"
    echo "  Copy the template and fill in your credentials:"
    echo "    cp .env.example .env"
    echo ""
    echo "  Required variables:"
    echo "    JIRA_BASE_URL       URL do servidor Jira"
    echo "    JIRA_PERSONAL_TOKEN Token de autenticacao Jira"
    echo "    XRAY_BASE_URL       URL do servidor Xray"
    echo ""
    echo "  GitLab (opcional):"
    echo "    GIT_BASE_URL        URL do GitLab"
    echo "    GIT_TOKEN           Token de autenticacao GitLab"
    echo ""
fi

# -- Summary ------------------------------------------------------------
echo "============================================="
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "  Quick start:"
  echo "    ./qatools.sh"
  echo "    ./qatools.sh -y           (pula confirmacao de instalacao)"
echo ""
echo "  Environment vars:"
echo "    QUIET=true    Suprime output informativo"
echo "    DRY_RUN=true  Simula API calls sem executar"
echo "============================================="
echo ""
