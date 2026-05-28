import json
import unittest

from mcp.skills_discovery.server import PROTOCOL_VERSION, handle_line, handle_request


class FakeCache:
    def items(self):
        return [
            {
                "id": "skill:1",
                "full_name": "acme/codex-tdd",
                "name": "codex-tdd",
                "description": "TDD testing skill for Codex",
                "source_type": "skill",
                "platforms": ["codex"],
                "use_cases": ["testing"],
                "language": "Python",
                "stars": 5000,
                "updated_at": "2026-05-28T00:00:00Z",
                "url": "https://github.com/acme/codex-tdd",
                "install": {
                    "status": "manual_review",
                    "repo_url": "https://github.com/acme/codex-tdd",
                    "readme_url": "https://github.com/acme/codex-tdd#readme",
                    "notes": "Review README.",
                },
                "search_text": "skill acme/codex-tdd tdd testing skill for codex testing",
            }
        ]

    def status(self):
        return {
            "source_url": "https://example.invalid/discovery_index.json",
            "cache_path": "/tmp/discovery_index.json",
            "last_refresh": "2026-05-28T00:00:00+00:00",
            "catalog_updated_at": "2026-05-28T00:00:00+00:00",
            "item_count": 1,
            "warnings": [],
        }


class UnavailableCatalogCache:
    def items(self):
        raise RuntimeError("catalog unavailable")


class BadCatalogCache:
    def items(self):
        item = FakeCache().items()[0].copy()
        item["stars"] = object()
        return [item]


class McpServerTests(unittest.TestCase):
    def test_initialize_response(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 1, "method": "initialize"})

        self.assertEqual(response["jsonrpc"], "2.0")
        self.assertEqual(response["id"], 1)
        self.assertEqual(response["result"]["protocolVersion"], PROTOCOL_VERSION)
        self.assertEqual(response["result"]["capabilities"], {"tools": {}})
        self.assertEqual(response["result"]["serverInfo"]["name"], "skills-discovery")
        self.assertEqual(response["result"]["serverInfo"]["version"], "0.1.0")

    def test_tools_list_response_includes_tools(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})

        tool_names = [tool["name"] for tool in response["result"]["tools"]]
        self.assertIn("search_catalog", tool_names)
        self.assertIn("get_catalog_status", tool_names)

    def test_tools_call_get_catalog_status_returns_content_text(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "get_catalog_status"},
            },
        )

        content = response["result"]["content"]
        self.assertEqual(content[0]["type"], "text")
        payload = json.loads(content[0]["text"])
        self.assertIn("Catalog cache", payload["answer_summary"])
        self.assertEqual(payload["meta"]["item_count"], 1)

    def test_tools_call_get_install_instructions_missing_repo_full_name_returns_error_code_minus_32602(self):
        for arguments in ({}, {"client": "codex"}):
            with self.subTest(arguments=arguments):
                response = handle_request(
                    FakeCache(),
                    {
                        "jsonrpc": "2.0",
                        "id": 11,
                        "method": "tools/call",
                        "params": {"name": "get_install_instructions", "arguments": arguments},
                    },
                )

                self.assertEqual(response["id"], 11)
                self.assertEqual(response["error"]["code"], -32602)

    def test_tools_call_get_install_instructions_valid_args_succeeds(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 12,
                "method": "tools/call",
                "params": {
                    "name": "get_install_instructions",
                    "arguments": {"repo_full_name": "acme/codex-tdd", "client": "codex"},
                },
            },
        )

        content = response["result"]["content"]
        self.assertEqual(content[0]["type"], "text")
        payload = json.loads(content[0]["text"])
        self.assertIn("acme/codex-tdd", payload["answer_summary"])

    def test_tools_call_none_arguments_returns_error_code_minus_32602(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 8,
                "method": "tools/call",
                "params": {"name": "get_catalog_status", "arguments": None},
            },
        )

        self.assertEqual(response["error"]["code"], -32602)

    def test_unknown_method_returns_error_code_minus_32601(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 4, "method": "missing"})

        self.assertEqual(response["error"]["code"], -32601)

    def test_initialized_notification_returns_none(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "method": "notifications/initialized"})

        self.assertIsNone(response)

    def test_request_without_id_is_notification_and_returns_none(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "method": "tools/list"})

        self.assertIsNone(response)

    def test_unknown_method_without_id_is_notification_and_returns_none(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "method": "missing"})

        self.assertIsNone(response)

    def test_valid_non_object_json_returns_invalid_request_error(self):
        for line in ("[]", "42", '"request"', "true"):
            with self.subTest(line=line):
                response = handle_line(FakeCache(), line)

                self.assertEqual(response["error"]["code"], -32600)

    def test_invalid_json_parse_error_uses_null_id(self):
        response = handle_line(FakeCache(), "{")

        self.assertIsNone(response["id"])
        self.assertEqual(response["error"]["code"], -32700)

    def test_invalid_tool_args_return_error_code_minus_32602(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {"name": "search_catalog", "arguments": {"limit": 0}},
            },
        )

        self.assertEqual(response["error"]["code"], -32602)

    def test_unknown_tool_returns_error_code_minus_32602(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {"name": "missing_tool"},
            },
        )

        self.assertEqual(response["error"]["code"], -32602)

    def test_unexpected_tools_call_error_preserves_request_id(self):
        response = handle_request(
            UnavailableCatalogCache(),
            {
                "jsonrpc": "2.0",
                "id": 99,
                "method": "tools/call",
                "params": {"name": "search_catalog"},
            },
        )

        self.assertEqual(response["id"], 99)
        self.assertEqual(response["error"]["code"], -32603)
        self.assertEqual(response["error"]["message"], "catalog unavailable")

    def test_internal_type_error_during_tool_execution_returns_internal_error_with_request_id(self):
        response = handle_request(
            BadCatalogCache(),
            {
                "jsonrpc": "2.0",
                "id": 123,
                "method": "tools/call",
                "params": {"name": "search_catalog"},
            },
        )

        self.assertEqual(response["id"], 123)
        self.assertEqual(response["error"]["code"], -32603)

    def test_falsy_non_object_tool_arguments_return_error_code_minus_32602(self):
        for arguments in ([], "", 0, False, None):
            with self.subTest(arguments=arguments):
                response = handle_request(
                    FakeCache(),
                    {
                        "jsonrpc": "2.0",
                        "id": 6,
                        "method": "tools/call",
                        "params": {"name": "get_catalog_status", "arguments": arguments},
                    },
                )

                self.assertEqual(response["error"]["code"], -32602)

    def test_non_object_tools_call_params_return_error_code_minus_32602(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 7,
                "method": "tools/call",
                "params": [],
            },
        )

        self.assertEqual(response["error"]["code"], -32602)


if __name__ == "__main__":
    unittest.main()
