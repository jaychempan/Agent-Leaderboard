#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SKILLS_DISCOVERY_REPO_URL:-https://github.com/jaychempan/Agent-Leaderboard.git}"
REF="${SKILLS_DISCOVERY_REF:-main}"
INSTALL_DIR="${SKILLS_DISCOVERY_INSTALL_DIR:-$HOME/.local/share/skills-discovery-mcp}"
BIN_DIR="${SKILLS_DISCOVERY_BIN_DIR:-$HOME/.local/bin}"
SOURCE_DIR="$INSTALL_DIR/source"
VENV_DIR="$INSTALL_DIR/.venv"
COMMAND_PATH="$BIN_DIR/skills-discovery-mcp"
CONFIGURE_CLIENTS="${SKILLS_DISCOVERY_CONFIGURE_CLIENTS:-}"

log() {
  printf 'skills-discovery-mcp: %s\n' "$*"
}

if ! command -v git >/dev/null 2>&1; then
  printf 'skills-discovery-mcp: missing required command: git\n' >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf 'skills-discovery-mcp: missing required command: python3\n' >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

if [ -d "$SOURCE_DIR/.git" ]; then
  log "updating source in $SOURCE_DIR"
  git -C "$SOURCE_DIR" fetch --depth=1 origin "$REF"
  git -C "$SOURCE_DIR" checkout --detach FETCH_HEAD >/dev/null
else
  rm -rf "$SOURCE_DIR"
  log "cloning $REPO_URL ($REF) into $SOURCE_DIR"
  git clone --depth=1 --branch "$REF" "$REPO_URL" "$SOURCE_DIR"
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  log "creating virtual environment in $VENV_DIR"
  rm -rf "$VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

cat >"$COMMAND_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$SOURCE_DIR"
exec "$VENV_DIR/bin/python" -m mcp.skills_discovery.server "\$@"
EOF

chmod +x "$COMMAND_PATH"

log "installed command: $COMMAND_PATH"

if [ -z "$CONFIGURE_CLIENTS" ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
  printf 'Configure detected MCP clients now? [Y/n] ' >/dev/tty
  read -r reply </dev/tty || reply=""
  case "$reply" in
    n|N|no|NO|No) CONFIGURE_CLIENTS="none" ;;
    *) CONFIGURE_CLIENTS="auto" ;;
  esac
fi

if [ -n "$CONFIGURE_CLIENTS" ] && [ "$CONFIGURE_CLIENTS" != "none" ] && [ "$CONFIGURE_CLIENTS" != "0" ]; then
  "$VENV_DIR/bin/python" "$SOURCE_DIR/scripts/configure_mcp_client.py" \
    --command "$COMMAND_PATH" \
    --clients "$CONFIGURE_CLIENTS"
elif [ -z "$CONFIGURE_CLIENTS" ]; then
  log "client config not changed; set SKILLS_DISCOVERY_CONFIGURE_CLIENTS=auto to configure detected clients"
fi

cat <<EOF

If your MCP client was not configured automatically, add this server manually:

{
  "mcpServers": {
    "skills-discovery": {
      "command": "skills-discovery-mcp"
    }
  }
}

If $BIN_DIR is not on PATH, use the absolute command path:
$COMMAND_PATH

Automatic client configuration:
  SKILLS_DISCOVERY_CONFIGURE_CLIENTS=auto    configure detected clients
  SKILLS_DISCOVERY_CONFIGURE_CLIENTS=none    skip client configuration
  SKILLS_DISCOVERY_CONFIGURE_CLIENTS=codex,claude,cursor
EOF
