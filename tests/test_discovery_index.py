import json
import tempfile
import unittest
from pathlib import Path

from mcp.skills_discovery.index import (
    SOURCE_FILES,
    build_discovery_index,
    infer_platforms,
    normalize_record,
    write_index_files,
)


class DiscoveryIndexTests(unittest.TestCase):
    def test_infer_platforms_from_category_topics_and_description(self):
        record = {
            "full_name": "example/codex-testing-skill",
            "description": "Testing workflow for Claude Code, Codex, and Cursor",
            "category": "codex",
            "categories": ["codex", "claude"],
            "topics": ["cursor", "agent-tools"],
        }

        self.assertEqual(infer_platforms(record), ["claude", "codex", "cursor"])

    def test_normalize_record_builds_searchable_skill_item(self):
        source = {
            "id": 42,
            "full_name": "acme/test-skill",
            "description": "TDD helper for Codex",
            "stars": 1200,
            "forks": 33,
            "language": "Python",
            "topics": ["testing", "codex"],
            "url": "https://github.com/acme/test-skill",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-05-20T00:00:00Z",
            "category": "codex",
            "categories": ["codex"],
            "use_cases": ["测试", "AI 代理"],
        }

        item = normalize_record(source, source_type="skill", rank=7)

        self.assertEqual(item["id"], "skill:42")
        self.assertEqual(item["source_id"], 42)
        self.assertEqual(item["name"], "test-skill")
        self.assertEqual(item["full_name"], "acme/test-skill")
        self.assertEqual(item["source_type"], "skill")
        self.assertEqual(item["platforms"], ["codex"])
        self.assertEqual(item["rank_signals"]["rank"], 7)
        self.assertEqual(item["install"]["status"], "manual_review")
        self.assertIn("tdd helper", item["search_text"])
        self.assertIn("testing", item["search_text"])

    def test_build_discovery_index_reads_all_known_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "data"
            data_dir.mkdir()
            for source_type, file_name in SOURCE_FILES.items():
                payload = {
                    "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 1},
                    "repos": [
                        {
                            "id": len(source_type),
                            "full_name": f"acme/{source_type}-tool",
                            "description": f"{source_type} helper for Codex",
                            "stars": 100 + len(source_type),
                            "forks": 1,
                            "language": "Python",
                            "topics": [source_type, "codex"],
                            "url": f"https://github.com/acme/{source_type}-tool",
                            "created_at": "2026-01-01T00:00:00Z",
                            "updated_at": "2026-05-20T00:00:00Z",
                            "category": "codex",
                            "categories": ["codex"],
                            "use_cases": ["AI 代理"],
                        }
                    ],
                }
                (data_dir / file_name).write_text(json.dumps(payload), encoding="utf-8")

            index = build_discovery_index(root)

        self.assertEqual(index["meta"]["total"], len(SOURCE_FILES))
        self.assertEqual(set(index["sources"].keys()), set(SOURCE_FILES.keys()))
        self.assertEqual(len(index["items"]), len(SOURCE_FILES))
        self.assertTrue(all("search_text" in item for item in index["items"]))

    def test_write_index_files_writes_json_and_js_wrapper(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            index = {
                "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 0},
                "sources": {},
                "items": [],
            }

            write_index_files(index, out_dir)

            json_payload = json.loads((out_dir / "discovery_index.json").read_text(encoding="utf-8"))
            js_payload = (out_dir / "discovery_index.js").read_text(encoding="utf-8")

        self.assertEqual(json_payload["meta"]["total"], 0)
        self.assertTrue(js_payload.startswith("window.DISCOVERY_INDEX = "))
        self.assertTrue(js_payload.rstrip().endswith(";"))


if __name__ == "__main__":
    unittest.main()
