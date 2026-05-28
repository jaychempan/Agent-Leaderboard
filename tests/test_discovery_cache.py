import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mcp.skills_discovery.cache import (
    ENV_CACHE_DIR,
    ENV_INDEX_URL,
    CatalogCache,
    default_cache_dir,
)


PAYLOAD = {
    "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 1},
    "items": [{"id": "skill:1", "full_name": "acme/codex-tdd"}],
}


class DiscoveryCacheTests(unittest.TestCase):
    def test_refresh_writes_cache_and_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = CatalogCache(cache_dir=tmp, source_url="https://example.test/index.json")

            with patch("mcp.skills_discovery.cache.fetch_json", return_value=PAYLOAD):
                catalog = cache.load()

            cache_path = Path(tmp) / "discovery_index.json"
            status = cache.status()

            self.assertEqual(catalog, PAYLOAD)
            self.assertTrue(cache_path.exists())
            self.assertEqual(json.loads(cache_path.read_text(encoding="utf-8")), PAYLOAD)
            self.assertEqual(status["source_url"], "https://example.test/index.json")
            self.assertEqual(status["cache_path"], str(cache_path))
            self.assertIsNotNone(status["last_refresh"])
            self.assertEqual(status["catalog_updated_at"], "2026-05-29T00:00:00+00:00")
            self.assertEqual(status["item_count"], 1)
            self.assertEqual(status["warnings"], [])

    def test_load_uses_last_good_cache_when_remote_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "discovery_index.json"
            cache_path.write_text(json.dumps(PAYLOAD), encoding="utf-8")
            cache = CatalogCache(cache_dir=tmp, source_url="https://example.test/index.json")

            with patch("mcp.skills_discovery.cache.fetch_json", side_effect=OSError("offline")):
                catalog = cache.load()

            self.assertEqual(catalog["items"][0]["id"], "skill:1")
            self.assertEqual(cache.items(), PAYLOAD["items"])
            self.assertTrue(any("offline" in warning for warning in cache.status()["warnings"]))

    def test_env_overrides_source_url_and_cache_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(
                os.environ,
                {
                    ENV_CACHE_DIR: tmp,
                    ENV_INDEX_URL: "https://example.test/env-index.json",
                },
                clear=False,
            ):
                cache = CatalogCache()

                self.assertEqual(default_cache_dir(), Path(tmp))
                self.assertEqual(cache.source_url, "https://example.test/env-index.json")
                self.assertEqual(cache.cache_path, Path(tmp) / "discovery_index.json")


if __name__ == "__main__":
    unittest.main()
