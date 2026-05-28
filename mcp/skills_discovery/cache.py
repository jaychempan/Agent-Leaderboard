from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union


DEFAULT_INDEX_URL = "https://agentskills.media/data/discovery_index.json"
ENV_INDEX_URL = "SKILLS_DISCOVERY_INDEX_URL"
ENV_CACHE_DIR = "SKILLS_DISCOVERY_CACHE_DIR"
CACHE_FILE_NAME = "discovery_index.json"
USER_AGENT = "skills-discovery-mcp/0.1"


def default_cache_dir() -> Path:
    override = os.environ.get(ENV_CACHE_DIR)
    if override:
        return Path(override).expanduser()
    return Path.home() / ".cache" / "skills-discovery-mcp"


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CatalogCache:
    def __init__(self, cache_dir: Optional[Union[os.PathLike[str], str]] = None, source_url: Optional[str] = None):
        self.source_url = source_url or os.environ.get(ENV_INDEX_URL) or DEFAULT_INDEX_URL
        self.cache_dir = Path(cache_dir).expanduser() if cache_dir is not None else default_cache_dir()
        self.cache_path = self.cache_dir / CACHE_FILE_NAME
        self.last_refresh: Optional[str] = None
        self.warnings: list[str] = []
        self._catalog: Optional[dict[str, Any]] = None

    def load(self) -> dict[str, Any]:
        self.warnings = []
        try:
            catalog = fetch_json(self.source_url)
        except Exception as error:
            if not self.cache_path.exists():
                raise
            self.warnings.append(f"Remote catalog fetch failed; using cached catalog: {error}")
            catalog = self._read_cache()
        else:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(
                json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            self.last_refresh = _now_iso()

        self._catalog = catalog
        return catalog

    def catalog(self) -> dict[str, Any]:
        if self._catalog is None:
            return self.load()
        return self._catalog

    def items(self) -> list[dict[str, Any]]:
        items = self.catalog().get("items", [])
        return items if isinstance(items, list) else []

    def status(self) -> dict[str, Any]:
        catalog = self._catalog or {}
        meta = catalog.get("meta", {}) if isinstance(catalog, dict) else {}
        return {
            "source_url": self.source_url,
            "cache_path": str(self.cache_path),
            "last_refresh": self.last_refresh,
            "catalog_updated_at": meta.get("updated_at"),
            "item_count": len(self.items()) if self._catalog is not None else 0,
            "warnings": list(self.warnings),
        }

    def _read_cache(self) -> dict[str, Any]:
        with self.cache_path.open(encoding="utf-8") as handle:
            return json.load(handle)
