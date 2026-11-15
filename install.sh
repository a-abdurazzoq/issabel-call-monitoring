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
[ -f "$SRC_DIR/asterisk/extensions_cp_spy.conf" ] || fail "asterisk/extensions_cp_spy.conf not found next to install.sh"
[ -d "$MODULES_DIR" ] || fail "$MODULES_DIR not found - is this an Issabel server?"
command -v issabel-menumerge > /dev/null || fail "issabel-menumerge not found - is this an Issabel server?"

echo -e "${GREEN}Installing Call Monitoring module...${NC}"
rm -rf "$DEST"
cp -a "$SRC_DIR/control_panel" "$DEST"

# Adds "PBX -> Call Monitoring" to the Issabel menu (no-op if already there)
(cd "$SRC_DIR" && yes | issabel-menumerge control.xml > /dev/null 2>&1) || true

chown -R asterisk:asterisk "$DEST"
chmod -R 755 "$DEST"

# Dialplan for call listening on an external number (the supervisor confirms
# with 1, so voicemail never gets the conversation). Own file, included from
# extensions_custom.conf, which FreePBX never overwrites.
AST_DIR=/etc/asterisk
if [ -d "$AST_DIR" ]; then
    cp "$SRC_DIR/asterisk/extensions_cp_spy.conf" "$AST_DIR/extensions_cp_spy.conf"
    touch "$AST_DIR/extensions_custom.conf"
    grep -q '^#include extensions_cp_spy.conf' "$AST_DIR/extensions_custom.conf" \
        || printf '\n#include extensions_cp_spy.conf\n' >> "$AST_DIR/extensions_custom.conf"
    chown asterisk:asterisk "$AST_DIR/extensions_cp_spy.conf" "$AST_DIR/extensions_custom.conf"
    if asterisk -rx "dialplan reload" > /dev/null 2>&1; then
        echo "Dialplan: cp-spy-confirm installed."
    else
        echo -e "${RED}Asterisk is not running: run 'asterisk -rx \"dialplan reload\"' later.${NC}"
    fi
else
    echo -e "${RED}$AST_DIR not found: listening on external numbers will not work.${NC}"
fi

echo ""
echo -e "${GREEN}Installation completed.${NC}"
echo "Menu: PBX -> Call Monitoring. Reload the page with Ctrl+F5 after an update."
