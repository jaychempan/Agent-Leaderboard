from __future__ import annotations

import json
import sys
from typing import Any, Optional

from mcp.skills_discovery.cache import CatalogCache
from mcp.skills_discovery.tools import TOOL_NAMES, call_tool, list_tools


PROTOCOL_VERSION = "2024-11-05"

JSONRPC_VERSION = "2.0"
METHOD_NOT_FOUND = -32601
INVALID_REQUEST = -32600
INVALID_PARAMS = -32602
PARSE_ERROR = -32700
INTERNAL_ERROR = -32603


def validate_tool_call_params(request: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    params = request.get("params", {})
    if params is None:
        params = {}
    if not isinstance(params, dict):
        raise ValueError("params must be an object")

    name = params["name"]
    if not isinstance(name, str):
        raise ValueError("name must be a string")
    if name not in TOOL_NAMES:
        raise ValueError(f"Unknown tool: {name}")

    arguments = params["arguments"] if "arguments" in params else {}
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")

    validate_tool_arguments(name, arguments)
    return name, arguments


def validate_tool_arguments(name: str, arguments: dict[str, Any]) -> None:
    tool = next((tool for tool in list_tools() if tool["name"] == name), None)
    if tool is None:
        raise ValueError(f"Unknown tool: {name}")

    properties = tool.get("inputSchema", {}).get("properties", {})
    for argument_name, value in arguments.items():
        schema = properties.get(argument_name)
        if schema is None:
            continue
        expected_type = schema.get("type")
        if expected_type == "string" and not isinstance(value, str):
            raise ValueError(f"{argument_name} must be a string")
        if expected_type == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"{argument_name} must be an integer")
            minimum = schema.get("minimum")
            maximum = schema.get("maximum")
            if minimum is not None and value < minimum:
                raise ValueError(f"{argument_name} must be greater than or equal to {minimum}")
            if maximum is not None and value > maximum:
                raise ValueError(f"{argument_name} must be less than or equal to {maximum}")


def jsonrpc_result(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "result": result}


def jsonrpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "error": {
            "code": code,
            "message": message,
        },
    }


def handle_request(cache: CatalogCache, request: Any) -> Optional[dict[str, Any]]:
    if not isinstance(request, dict):
        return jsonrpc_error(None, INVALID_REQUEST, "Invalid Request")

    method = request.get("method")
    request_id = request.get("id")

    if method == "notifications/initialized":
        return None

    if "id" not in request:
        return None

    if method == "initialize":
        return jsonrpc_result(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "skills-discovery",
                    "version": "0.1.0",
                },
            },
        )

    if method == "tools/list":
        return jsonrpc_result(request_id, {"tools": list_tools()})

    if method == "tools/call":
        try:
            name, arguments = validate_tool_call_params(request)
        except (KeyError, TypeError, ValueError) as error:
            return jsonrpc_error(request_id, INVALID_PARAMS, str(error))

        try:
            result = call_tool(cache, name, arguments)
        except Exception as error:
            return jsonrpc_error(request_id, INTERNAL_ERROR, str(error))
        return jsonrpc_result(request_id, result)

    return jsonrpc_error(request_id, METHOD_NOT_FOUND, f"Method not found: {method}")


def handle_line(cache: CatalogCache, line: str) -> Optional[dict[str, Any]]:
    try:
        request = json.loads(line)
    except json.JSONDecodeError as error:
        return jsonrpc_error(None, PARSE_ERROR, str(error))

    return handle_request(cache, request)


def main() -> int:
    cache = CatalogCache()
    try:
        cache.load()
    except Exception as error:
        print(f"skills-discovery: failed to load catalog: {error}", file=sys.stderr, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            response = handle_line(cache, line)
        except Exception as error:
            response = jsonrpc_error(None, INTERNAL_ERROR, str(error))

        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
