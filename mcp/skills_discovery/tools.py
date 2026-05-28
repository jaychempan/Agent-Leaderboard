from __future__ import annotations

import json
from typing import Any

from mcp.skills_discovery import search


TOOL_NAMES = [
    "search_catalog",
    "recommend_for_task",
    "get_top_rankings",
    "get_install_instructions",
    "get_catalog_status",
]


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": "search_catalog",
            "description": "Search the skills discovery catalog by query and optional filters.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query text."},
                    "source_type": {
                        "type": "string",
                        "description": "Optional source type filter such as skill, mcp, prompt, framework, or research.",
                    },
                    "platform": {"type": "string", "description": "Optional platform filter such as codex."},
                    "use_case": {"type": "string", "description": "Optional use case filter."},
                    "min_stars": {"type": "integer", "description": "Minimum GitHub stars.", "minimum": 0},
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results.",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
            },
        },
        {
            "name": "recommend_for_task",
            "description": "Recommend skill catalog entries for a natural-language task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "Task or workflow to find skills for."},
                    "platform": {"type": "string", "description": "Optional platform filter such as codex."},
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of recommendations.",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
            },
        },
        {
            "name": "get_top_rankings",
            "description": "Return top catalog entries sorted by stars or recent update time.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source_type": {
                        "type": "string",
                        "description": "Optional source type filter such as skill, mcp, prompt, framework, or research.",
                    },
                    "platform": {"type": "string", "description": "Optional platform filter such as codex."},
                    "use_case": {"type": "string", "description": "Optional use case filter."},
                    "sort": {
                        "type": "string",
                        "description": "Ranking sort. Use stars or recently_updated.",
                        "enum": ["stars", "recently_updated"],
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results.",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
            },
        },
        {
            "name": "get_install_instructions",
            "description": "Return manual install guidance for a catalog repository.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repo_full_name": {
                        "type": "string",
                        "description": "Repository full name, for example owner/name.",
                    },
                    "client": {"type": "string", "description": "Target MCP or agent client."},
                },
                "required": ["repo_full_name"],
            },
        },
        {
            "name": "get_catalog_status",
            "description": "Return discovery catalog cache status.",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]


def call_tool(cache: Any, name: str, arguments: dict[str, Any] | None = None) -> dict[str, list[dict[str, str]]]:
    if arguments is not None and not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")
    args = arguments or {}

    if name == "search_catalog":
        payload = search.search_catalog(
            cache.items(),
            query=_str_arg(args, "query"),
            source_type=_str_arg(args, "source_type"),
            platform=_str_arg(args, "platform"),
            use_case=_str_arg(args, "use_case"),
            min_stars=_min_stars_arg(args, "min_stars", 0),
            limit=_limit_arg(args, "limit", 10),
        )
    elif name == "recommend_for_task":
        payload = search.recommend_for_task(
            cache.items(),
            task=_str_arg(args, "task"),
            platform=_str_arg(args, "platform"),
            limit=_limit_arg(args, "limit", 5),
        )
    elif name == "get_top_rankings":
        payload = search.top_rankings(
            cache.items(),
            source_type=_str_arg(args, "source_type"),
            platform=_str_arg(args, "platform"),
            use_case=_str_arg(args, "use_case"),
            sort=_str_arg(args, "sort", "stars"),
            limit=_limit_arg(args, "limit", 10),
        )
    elif name == "get_install_instructions":
        payload = search.get_install_instructions(
            cache.items(),
            repo_full_name=_str_arg(args, "repo_full_name"),
            client=_str_arg(args, "client", "generic"),
        )
    elif name == "get_catalog_status":
        status = cache.status()
        payload = {
            "answer_summary": f"Catalog cache has {status.get('item_count', 0)} items.",
            "items": [],
            "meta": status,
        }
    else:
        raise ValueError(f"Unknown tool: {name}")

    return _text_result(payload)


def _text_result(payload: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(payload, ensure_ascii=False, indent=2),
            }
        ]
    }


def _str_arg(args: dict[str, Any], name: str, default: str = "") -> str:
    if name not in args:
        return default
    value = args[name]
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    return str(value)


def _int_arg(args: dict[str, Any], name: str, default: int) -> int:
    if name not in args:
        return default
    value = args[name]
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer")
    if isinstance(value, int):
        return value
    raise ValueError(f"{name} must be an integer")


def _limit_arg(args: dict[str, Any], name: str, default: int) -> int:
    value = _int_arg(args, name, default)
    if value < 1 or value > 50:
        raise ValueError(f"{name} must be between 1 and 50")
    return value


def _min_stars_arg(args: dict[str, Any], name: str, default: int) -> int:
    value = _int_arg(args, name, default)
    if value < 0:
        raise ValueError(f"{name} must be greater than or equal to 0")
    return value
