#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import time
from pathlib import Path


SERVER_NAME = "skills-discovery"


def backup(path: Path) -> None:
    if path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{time.time_ns()}"))


def json_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def replace_toml_table(text: str, table: str, body: str) -> str:
    pattern = re.compile(rf"(?ms)^\[{re.escape(table)}\]\n.*?(?=^\[|\Z)")
    replacement = f"[{table}]\n{body.rstrip()}\n"
    if pattern.search(text):
        return pattern.sub(replacement, text).rstrip() + "\n"
    prefix = text.rstrip()
    return f"{prefix}\n\n{replacement}" if prefix else replacement


def configure_codex(home: Path, command: str, create: bool) -> bool:
    path = home / ".codex" / "config.toml"
    if not create and not path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    updated = replace_toml_table(
        existing,
        f"mcp_servers.{SERVER_NAME}",
        f"command = {toml_string(command)}",
    )
    if updated != existing:
        backup(path)
        path.write_text(updated, encoding="utf-8")
    print(f"configured codex: {path}")
    return True


def configure_json(path: Path, command: str, create: bool, label: str) -> bool:
    if not create and not path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8").strip():
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"{path} must contain a JSON object")
    else:
        payload = {}

    mcp_servers = payload.setdefault("mcpServers", {})
    if not isinstance(mcp_servers, dict):
        raise ValueError(f"{path} field mcpServers must be a JSON object")
    mcp_servers[SERVER_NAME] = {"command": command}

    updated = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if updated != existing:
        backup(path)
        path.write_text(updated, encoding="utf-8")
    print(f"configured {label}: {path}")
    return True


def configure_claude(home: Path, command: str, create: bool) -> bool:
    return configure_json(
        home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json",
        command,
        create,
        "claude",
    )


def configure_cursor(home: Path, command: str, create: bool) -> bool:
    return configure_json(home / ".cursor" / "mcp.json", command, create, "cursor")


def selected_clients(raw: str, home: Path) -> list[str]:
    clients = [client.strip().lower() for client in raw.split(",") if client.strip()]
    if not clients or "auto" not in clients:
        return clients

    detected: list[str] = []
    if (home / ".codex").exists():
        detected.append("codex")
    if (home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json").exists():
        detected.append("claude")
    if (home / ".cursor" / "mcp.json").exists():
        detected.append("cursor")
    return detected


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure MCP clients for Skills Discovery.")
    parser.add_argument("--home", default=str(Path.home()), help="Home directory to configure.")
    parser.add_argument("--command", required=True, help="Command path for the MCP server.")
    parser.add_argument("--clients", default="auto", help="Comma-separated clients: auto,codex,claude,cursor.")
    args = parser.parse_args()

    home = Path(args.home).expanduser()
    command = str(Path(args.command).expanduser())
    clients = selected_clients(args.clients, home)
    if not clients:
        print("no existing MCP client config files detected")
        return 0

    configured = 0
    for client in clients:
        if client == "codex":
            configured += int(configure_codex(home, command, create=True))
        elif client == "claude":
            configured += int(configure_claude(home, command, create=True))
        elif client == "cursor":
            configured += int(configure_cursor(home, command, create=True))
        else:
            raise ValueError(f"unknown client: {client}")

    print(f"configured {configured} MCP client(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
