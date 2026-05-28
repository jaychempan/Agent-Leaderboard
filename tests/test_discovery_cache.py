import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from mcp.skills_discovery.cache import (
    ENV_CACHE_DIR,
    ENV_INDEX_URL,
    FETCH_TIMEOUT_SECONDS,
    CatalogCache,
    _write_json_atomic,
    default_cache_dir,
    fetch_json,
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

    def test_load_returns_remote_catalog_when_cache_write_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = CatalogCache(cache_dir=tmp, source_url="https://example.test/index.json")

            with patch("mcp.skills_discovery.cache.fetch_json", return_value=PAYLOAD):
                with patch.object(Path, "replace", side_effect=OSError("readonly")):
                    catalog = cache.load()

            self.assertEqual(catalog, PAYLOAD)
            self.assertEqual(cache.items(), PAYLOAD["items"])
            self.assertTrue(any("readonly" in warning for warning in cache.status()["warnings"]))

    def test_write_json_atomic_writes_valid_json_to_cache_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "discovery_index.json"

            _write_json_atomic(cache_path, PAYLOAD)

            self.assertEqual(json.loads(cache_path.read_text(encoding="utf-8")), PAYLOAD)

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

    def test_fetch_json_uses_bounded_timeout(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(PAYLOAD).encode("utf-8")

        with patch("mcp.skills_discovery.cache.urllib.request.urlopen", return_value=response) as urlopen:
            catalog = fetch_json("https://example.test/index.json")

        self.assertEqual(catalog, PAYLOAD)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], FETCH_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
