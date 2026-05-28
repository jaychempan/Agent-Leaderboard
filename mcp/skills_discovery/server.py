from __future__ import annotations

import json
import sys
from typing import Any, Optional

from mcp.skills_discovery.cache import CatalogCache
from mcp.skills_discovery.tools import call_tool, list_tools


PROTOCOL_VERSION = "2024-11-05"

JSONRPC_VERSION = "2.0"
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
PARSE_ERROR = -32700
INTERNAL_ERROR = -32603


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


def handle_request(cache: CatalogCache, request: dict[str, Any]) -> Optional[dict[str, Any]]:
    method = request.get("method")
    request_id = request.get("id")

    if method == "notifications/initialized":
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
            params = request.get("params", {})
            if params is None:
                params = {}
            if not isinstance(params, dict):
                raise ValueError("params must be an object")
            name = params["name"]
            if not isinstance(name, str):
                raise ValueError("name must be a string")
            arguments = params["arguments"] if "arguments" in params else {}
            result = call_tool(cache, name, arguments)
        except (KeyError, TypeError, ValueError) as error:
            return jsonrpc_error(request_id, INVALID_PARAMS, str(error))
        return jsonrpc_result(request_id, result)

    return jsonrpc_error(request_id, METHOD_NOT_FOUND, f"Method not found: {method}")


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
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be an object")
        except (json.JSONDecodeError, ValueError) as error:
            response = jsonrpc_error(None, PARSE_ERROR, str(error))
        else:
            try:
                response = handle_request(cache, request)
            except Exception as error:
                response = jsonrpc_error(request.get("id"), INTERNAL_ERROR, str(error))

        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
