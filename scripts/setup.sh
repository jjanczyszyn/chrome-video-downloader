#!/usr/bin/env bash
# =============================================================================
# scripts/setup.sh – Course Library Exporter – Developer Setup
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

echo ""
echo "🎓 Course Library Exporter – Setup Script"
echo "==========================================="
echo ""

# ─── 1. Check Node version ───────────────────────────────────────────────────
log "Checking Node.js version…"
if ! command -v node &> /dev/null; then
  error "Node.js is not installed. Install v20+ from https://nodejs.org"
fi

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1).split('.')[0]) < 20 ? 1 : 0)" 2>&1 && echo "ok" || echo "fail")
if [ "$NODE_VERSION" = "fail" ]; then
  CURRENT=$(node --version)
  error "Node.js v20+ required. Current version: $CURRENT. Update from https://nodejs.org"
fi
log "Node.js $(node --version) ✓"

# ─── 2. Check / install pnpm ─────────────────────────────────────────────────
log "Checking pnpm…"
if ! command -v pnpm &> /dev/null; then
  warn "pnpm not found. Installing via npm…"
  npm install -g pnpm@latest || error "Failed to install pnpm. Install manually: npm i -g pnpm"
fi
log "pnpm $(pnpm --version) ✓"

# ─── 3. Install dependencies ─────────────────────────────────────────────────
log "Installing dependencies…"
pnpm install || error "pnpm install failed."
log "Dependencies installed ✓"

# ─── 4. Type check ───────────────────────────────────────────────────────────
log "Running TypeScript type check…"
pnpm type-check || warn "Type check had errors (see above). Continuing…"

# ─── 5. Run unit tests ───────────────────────────────────────────────────────
log "Running unit tests…"
pnpm test || warn "Some unit tests failed (see above). Continuing…"

# ─── 6. Build extension ──────────────────────────────────────────────────────
log "Building extension…"
pnpm build || error "Build failed."

# ─── 7. Install Playwright browsers (for E2E) ────────────────────────────────
log "Installing Playwright Chromium browser…"
pnpm exec playwright install chromium || warn "Playwright install failed. E2E tests may not run."

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "  Extension dist:    $(pwd)/dist/"
echo ""
echo "Next steps:"
echo ""
echo "  1. Load unpacked extension in Chrome:"
echo "     • Open chrome://extensions"
echo "     • Enable 'Developer mode'"
echo "     • Click 'Load unpacked' → select $(pwd)/dist/"
echo ""
echo "  2. Run the mock course site:"
echo "     pnpm mock:server"
echo "     → Open http://localhost:3456 in Chrome"
echo ""
echo "  3. Run E2E tests:"
echo "     pnpm test:e2e"
echo ""
echo "  See README.md for full documentation."
echo ""
