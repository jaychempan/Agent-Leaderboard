#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${SKILLS_DISCOVERY_INSTALL_DIR:-$HOME/.local/share/skills-discovery-mcp}"
BIN_DIR="${SKILLS_DISCOVERY_BIN_DIR:-$HOME/.local/bin}"
COMMAND_PATH="$BIN_DIR/skills-discovery-mcp"

rm -f "$COMMAND_PATH"
rm -rf "$INSTALL_DIR"

printf 'skills-discovery-mcp: removed %s and %s\n' "$COMMAND_PATH" "$INSTALL_DIR"
