import json
import unittest

from mcp.skills_discovery.tools import TOOL_NAMES, call_tool, list_tools


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


class McpToolsTests(unittest.TestCase):
    def _payload(self, result):
        self.assertEqual(result["content"][0]["type"], "text")
        return json.loads(result["content"][0]["text"])

    def test_list_tools_exposes_expected_names(self):
        tools = list_tools()

        self.assertEqual([tool["name"] for tool in tools], TOOL_NAMES)
        self.assertEqual(
            TOOL_NAMES,
            [
                "search_catalog",
                "recommend_for_task",
                "get_top_rankings",
                "get_install_instructions",
                "get_catalog_status",
            ],
        )
        for tool in tools:
            self.assertTrue(tool["description"])
            self.assertIsInstance(tool["inputSchema"], dict)

    def test_search_catalog_returns_text_content_with_known_repo(self):
        payload = self._payload(call_tool(FakeCache(), "search_catalog", {"query": "codex testing"}))

        self.assertIn("Found", payload["answer_summary"])
        self.assertEqual(payload["items"][0]["full_name"], "acme/codex-tdd")
        self.assertEqual(payload["meta"]["filters"]["query"], "codex testing")

    def test_get_catalog_status_returns_item_count(self):
        payload = self._payload(call_tool(FakeCache(), "get_catalog_status"))

        self.assertIn("Catalog cache", payload["answer_summary"])
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["meta"]["item_count"], 1)

    def test_get_top_rankings_text_is_json_with_summary_and_items(self):
        payload = self._payload(call_tool(FakeCache(), "get_top_rankings", {"limit": "1"}))

        self.assertIn("answer_summary", payload)
        self.assertIn("items", payload)
        self.assertEqual(payload["items"][0]["full_name"], "acme/codex-tdd")
        self.assertEqual(payload["meta"]["filters"]["limit"], 1)

    def test_recommend_for_task_returns_recommendation_reason_and_summary(self):
        payload = self._payload(
            call_tool(
                FakeCache(),
                "recommend_for_task",
                {"task": "Codex testing", "platform": "codex"},
            )
        )

        self.assertIn("Recommended", payload["answer_summary"])
        self.assertEqual(payload["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("why", payload["items"][0])
        self.assertIn("Recommended because", payload["items"][0]["why"])

    def test_get_install_instructions_returns_repo_client_and_manual_guidance(self):
        payload = self._payload(
            call_tool(
                FakeCache(),
                "get_install_instructions",
                {"repo_full_name": "acme/codex-tdd", "client": "codex"},
            )
        )

        self.assertEqual(payload["items"][0]["repo_full_name"], "acme/codex-tdd")
        self.assertEqual(payload["items"][0]["client"], "codex")
        self.assertEqual(payload["items"][0]["status"], "manual_review")
        self.assertIn("manual review", payload["answer_summary"])

    def test_unknown_tool_raises_value_error(self):
        with self.assertRaises(ValueError):
            call_tool(FakeCache(), "missing_tool")


if __name__ == "__main__":
    unittest.main()
