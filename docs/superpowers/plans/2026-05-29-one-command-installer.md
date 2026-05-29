# One-Command MCP Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curl-friendly install and uninstall scripts for the existing Python stdio MCP server.

**Architecture:** Keep the MCP server source unchanged. Add shell scripts under `scripts/` that clone/update the repository into a user-local install directory, create a venv, and expose a stable wrapper command in `~/.local/bin`.

**Tech Stack:** POSIX-style Bash, Python 3 standard library, pytest/unittest, existing static MCP server.

---

## File Structure

- Create `tests/test_install_scripts.py`: installer contract tests.
- Create `scripts/install.sh`: one-command installer.
- Create `scripts/uninstall.sh`: matching uninstaller.
- Modify `README.md`: English install and MCP config instructions.
- Modify `README.zh.md`: Chinese install and MCP config instructions.

## Tasks

- [ ] Write failing tests for script existence, syntax, and required installer contract strings.
- [ ] Run the focused test and confirm it fails because scripts are missing.
- [ ] Add `scripts/install.sh` with configurable repo/ref/install/bin paths, venv creation, source update, wrapper generation, and post-install MCP config output.
- [ ] Add `scripts/uninstall.sh` with matching configurable paths.
- [ ] Run the focused test and confirm it passes.
- [ ] Update README files with one-command installation, uninstall, update, and MCP config examples.
- [ ] Run the full test suite and shell syntax checks.
