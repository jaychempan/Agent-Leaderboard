import unittest

from mcp.skills_discovery.search import (
    get_install_instructions,
    recommend_for_task,
    search_catalog,
    tokenize,
    top_rankings,
)


ITEMS = [
    {
        "id": "skill:1",
        "full_name": "acme/codex-tdd",
        "name": "codex-tdd",
        "description": "TDD testing skill for Codex",
        "source_type": "skill",
        "platforms": ["codex"],
        "use_cases": ["测试", "代码审查"],
        "categories": ["codex"],
        "topics": ["testing", "tdd"],
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
        "search_text": "skill acme/codex-tdd tdd testing skill for codex testing tdd codex 测试 代码审查",
    },
    {
        "id": "skill:2",
        "full_name": "acme/claude-ui",
        "name": "claude-ui",
        "description": "UI UX design skill for Claude Code",
        "source_type": "skill",
        "platforms": ["claude"],
        "use_cases": ["UI/UX 设计"],
        "categories": ["claude"],
        "topics": ["ui", "ux"],
        "language": "TypeScript",
        "stars": 9000,
        "updated_at": "2026-05-10T00:00:00Z",
        "url": "https://github.com/acme/claude-ui",
        "install": {
            "status": "manual_review",
            "repo_url": "https://github.com/acme/claude-ui",
            "readme_url": "https://github.com/acme/claude-ui#readme",
            "notes": "Review README.",
        },
        "search_text": "skill acme/claude-ui ui ux design skill for claude code ui/ux 设计 claude",
    },
    {
        "id": "mcp:3",
        "full_name": "acme/browser-mcp",
        "name": "browser-mcp",
        "description": "Browser automation MCP server",
        "source_type": "mcp",
        "platforms": ["other"],
        "use_cases": ["网页浏览"],
        "categories": ["web"],
        "topics": ["browser", "mcp"],
        "language": "JavaScript",
        "stars": 12000,
        "updated_at": "2026-05-27T00:00:00Z",
        "url": "https://github.com/acme/browser-mcp",
        "install": {
            "status": "manual_review",
            "repo_url": "https://github.com/acme/browser-mcp",
            "readme_url": "https://github.com/acme/browser-mcp#readme",
            "notes": "Review README.",
        },
        "search_text": "mcp acme/browser-mcp browser automation mcp server web browser mcp 网页浏览",
    },
]


class DiscoverySearchTests(unittest.TestCase):
    def test_tokenize_normalizes_words_and_repo_tokens(self):
        self.assertEqual(tokenize("Codex TDD + acme/codex-tdd"), ["codex", "tdd", "+", "acme/codex-tdd"])

    def test_search_catalog_ignores_stopword_only_queries(self):
        result = search_catalog(ITEMS, query="I a the", source_type="skill", limit=5)

        self.assertEqual(result["items"], [])
        self.assertEqual(result["meta"]["count"], 0)

    def test_search_catalog_keeps_meaningful_terms_from_natural_language(self):
        result = search_catalog(ITEMS, query="I need TDD tests", source_type="skill", limit=5)

        self.assertEqual(result["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("tdd", result["items"][0]["match_reason"].lower())

    def test_search_catalog_filters_and_scores(self):
        result = search_catalog(ITEMS, query="codex testing", platform="codex", source_type="skill", limit=5)

        self.assertEqual(result["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("codex", result["items"][0]["match_reason"].lower())
        self.assertEqual(result["meta"]["count"], 1)

    def test_search_catalog_explains_search_text_only_matches(self):
        result = search_catalog(ITEMS, query="代码审查", limit=5)

        self.assertEqual(result["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("代码审查", result["items"][0]["match_reason"])

    def test_recommend_for_task_returns_reasons(self):
        result = recommend_for_task(ITEMS, task="I need TDD tests in Codex", platform="codex", limit=2)

        self.assertEqual(result["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("Recommended", result["answer_summary"])
        self.assertTrue(result["items"][0]["why"])

    def test_top_rankings_support_stars_and_recently_updated(self):
        by_stars = top_rankings(ITEMS, sort="stars", limit=2)
        by_update = top_rankings(ITEMS, sort="recently_updated", limit=2)

        self.assertEqual(by_stars["items"][0]["full_name"], "acme/browser-mcp")
        self.assertEqual(by_update["items"][0]["full_name"], "acme/codex-tdd")

    def test_get_install_instructions_returns_manual_guidance(self):
        result = get_install_instructions(ITEMS, repo_full_name="acme/codex-tdd", client="codex")

        self.assertIn("manual review", result["answer_summary"].lower())
        self.assertEqual(result["items"][0]["repo_url"], "https://github.com/acme/codex-tdd")
        self.assertEqual(result["items"][0]["client"], "codex")

    def test_empty_results_are_structured(self):
        result = search_catalog(ITEMS, query="nonexistent", limit=5)

        self.assertEqual(result["items"], [])
        self.assertEqual(result["meta"]["count"], 0)
        self.assertIn("No matching", result["answer_summary"])


if __name__ == "__main__":
    unittest.main()
