# One-Command MCP Installer Design

## Summary

Add a curl-friendly installer for the Skills Discovery MCP server. The installer creates an isolated user-local runtime, installs a command named `skills-discovery-mcp`, and leaves MCP client configuration as an explicit copy-paste step.

## Goals

- Let users install with one command from the repository's raw `scripts/install.sh`.
- Avoid modifying system Python or global site packages.
- Make updates idempotent by re-running the installer.
- Provide a matching uninstall script.
- Document MCP client configuration for command-based clients.

## Non-Goals

- Do not auto-edit Claude, Codex, Cursor, or other MCP client config files in the first version.
- Do not publish a PyPI package in this version.
- Do not require Node, Docker, or third-party Python packages.

## Architecture

The installer clones the repository into `~/.local/share/skills-discovery-mcp/source`, creates a Python virtual environment at `~/.local/share/skills-discovery-mcp/.venv`, and writes a small wrapper to `~/.local/bin/skills-discovery-mcp`. The wrapper runs:

```bash
python -m mcp.skills_discovery.server
```

from the cloned source directory using the venv Python. Because the server currently uses only the Python standard library, no package install step is required after venv creation.

## Configuration

The installer supports environment overrides:

- `SKILLS_DISCOVERY_REPO_URL`: Git repository to clone. Defaults to `https://github.com/jaychempan/Agent-Leaderboard.git`.
- `SKILLS_DISCOVERY_REF`: Branch or tag to install. Defaults to `main`.
- `SKILLS_DISCOVERY_INSTALL_DIR`: Install root. Defaults to `~/.local/share/skills-discovery-mcp`.
- `SKILLS_DISCOVERY_BIN_DIR`: Command directory. Defaults to `~/.local/bin`.

The runtime keeps existing server environment variables, including `SKILLS_DISCOVERY_INDEX_URL` and `SKILLS_DISCOVERY_CACHE_DIR`.

## Error Handling

The installer fails fast with `set -euo pipefail`, checks for `git` and `python3`, creates parent directories, and prints the MCP command path plus a JSON config snippet after installation. Re-running the installer updates the cloned source to the requested ref and rewrites the wrapper.

The uninstaller removes the install directory and wrapper command, honoring the same install and bin directory overrides.

## Testing

Add tests that verify:

- `scripts/install.sh` and `scripts/uninstall.sh` exist and pass shell syntax checks.
- The installer includes fail-fast shell options, dependency checks, the default repo URL, install paths, venv creation, and wrapper generation.
- The uninstaller targets the same install directory and command path.
- README documents the one-command install and MCP config snippet.
