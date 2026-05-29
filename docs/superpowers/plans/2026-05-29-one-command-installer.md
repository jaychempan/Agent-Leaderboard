# One-Command MCP Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curl-friendly install and uninstall scripts for the existing Python stdio MCP server, with optional automatic MCP client configuration.

**Architecture:** Keep the MCP server source unchanged. Add shell scripts under `scripts/` that clone/update the repository into a user-local install directory, create a venv, expose a stable wrapper command in `~/.local/bin`, and call a Python helper that safely merges MCP client config files.

**Tech Stack:** POSIX-style Bash, Python 3 standard library, pytest/unittest, existing static MCP server.

---

## File Structure

- Create `tests/test_install_scripts.py`: installer contract tests.
- Create `tests/test_configure_mcp_client.py`: client config merge tests.
- Create `scripts/install.sh`: one-command installer.
- Create `scripts/uninstall.sh`: matching uninstaller.
- Create `scripts/configure_mcp_client.py`: Codex, Claude Desktop, and Cursor config helper.
- Modify `README.md`: English install and MCP config instructions.
- Modify `README.zh.md`: Chinese install and MCP config instructions.

## Tasks

- [ ] Write failing tests for script existence, syntax, and required installer contract strings.
- [ ] Run the focused test and confirm it fails because scripts are missing.
- [ ] Add `scripts/install.sh` with configurable repo/ref/install/bin paths, venv creation, source update, wrapper generation, and post-install MCP config output.
- [ ] Add `scripts/uninstall.sh` with matching configurable paths.
- [ ] Add `scripts/configure_mcp_client.py` with backup and idempotent config merge support.
- [ ] Wire `scripts/install.sh` to prompt for detected-client configuration or honor `SKILLS_DISCOVERY_CONFIGURE_CLIENTS`.
- [ ] Run the focused test and confirm it passes.
- [ ] Update README files with one-command installation, uninstall, update, and MCP config examples.
- [ ] Run the full test suite and shell syntax checks.
