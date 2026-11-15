#!/bin/bash
# Installs or updates the Call Monitoring module (control_panel) on Issabel 5.
#
#   bash install.sh
#
# Safe to run again for an update: the module directory is replaced, while the
# panel layout (/var/www/db/control_panel_design.db) is kept.
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
MODULES_DIR=/var/www/html/modules
DEST="$MODULES_DIR/control_panel"

fail() { echo -e "${RED}$1${NC}" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run as root."
[ -d "$SRC_DIR/control_panel" ] || fail "control_panel/ not found next to install.sh"
[ -f "$SRC_DIR/control.xml" ] || fail "control.xml not found next to install.sh"
[ -d "$MODULES_DIR" ] || fail "$MODULES_DIR not found - is this an Issabel server?"
command -v issabel-menumerge > /dev/null || fail "issabel-menumerge not found - is this an Issabel server?"

echo -e "${GREEN}Installing Call Monitoring module...${NC}"
rm -rf "$DEST"
cp -a "$SRC_DIR/control_panel" "$DEST"

# Adds "PBX -> Call Monitoring" to the Issabel menu (no-op if already there)
(cd "$SRC_DIR" && yes | issabel-menumerge control.xml > /dev/null 2>&1) || true

chown -R asterisk:asterisk "$DEST"
chmod -R 755 "$DEST"

echo ""
echo -e "${GREEN}Installation completed.${NC}"
echo "Menu: PBX -> Call Monitoring. Reload the page with Ctrl+F5 after an update."
