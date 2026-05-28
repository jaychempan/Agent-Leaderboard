# MCP Skill Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python MCP server that lets users search, rank, and get install guidance from the project's daily-updated discovery catalog.

**Architecture:** Add a reusable Python package under `mcp/skills_discovery/` for catalog normalization, search, caching, and MCP tool handlers. Generate `data/discovery_index.json` and `data/discovery_index.js` from existing data files, then expose the same catalog through a dependency-light JSON-RPC stdio MCP server.

**Tech Stack:** Python 3.12 standard library, `unittest`, GitHub Actions, existing static `data/*.json` files.

---

## File Structure

- Create `mcp/skills_discovery/__init__.py`: package marker and version.
- Create `mcp/skills_discovery/index.py`: source loading, platform normalization, discovery record generation, JS wrapper writing.
- Create `mcp/skills_discovery/search.py`: deterministic query tokenization, filtering, scoring, ranking, and install instruction helpers.
- Create `mcp/skills_discovery/cache.py`: remote index fetch and local cache fallback.
- Create `mcp/skills_discovery/tools.py`: MCP tool definitions and tool-call dispatch.
- Create `mcp/skills_discovery/server.py`: minimal MCP JSON-RPC stdio server.
- Create `scripts/build_discovery_index.py`: CLI wrapper around `mcp.skills_discovery.index`.
- Create `tests/test_discovery_index.py`: index generation tests.
- Create `tests/test_discovery_search.py`: search, recommendation, ranking, and install guidance tests.
- Create `tests/test_discovery_cache.py`: cache freshness and fallback tests.
- Create `tests/test_mcp_tools.py`: MCP tool schema and handler tests.
- Create `tests/test_mcp_server.py`: JSON-RPC server request handling tests.
- Modify `.github/workflows/daily-update.yml`: run the index build after all fetch scripts and commit generated files.
- Modify `.gitignore`: ignore `/.superpowers`.
- Modify `README.md` and `README.zh.md`: document MCP setup and example chat queries.

## Task 1: Package Skeleton And Index Generation Tests

**Files:**
- Create: `mcp/skills_discovery/__init__.py`
- Create: `mcp/skills_discovery/index.py`
- Create: `scripts/build_discovery_index.py`
- Create: `tests/test_discovery_index.py`

- [ ] **Step 1: Write failing tests for discovery index generation**

Create `tests/test_discovery_index.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest tests.test_discovery_index -v
```

Expected: fail with `ModuleNotFoundError: No module named 'mcp.skills_discovery'`.

- [ ] **Step 3: Create the package skeleton**

Create `mcp/skills_discovery/__init__.py`:

```python
"""Skills discovery MCP package."""

__version__ = "0.1.0"
```

- [ ] **Step 4: Implement index generation**

Create `mcp/skills_discovery/index.py`:

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SOURCE_FILES = {
    "skill": "data.json",
    "mcp": "mcp_data.json",
    "prompt": "prompts_data.json",
    "framework": "frameworks_data.json",
    "research": "auto_research_data.json",
}

PLATFORMS = ("claude", "codex", "cursor", "copilot", "gemini")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def infer_platforms(record: dict[str, Any]) -> list[str]:
    text_parts = [
        record.get("full_name", ""),
        record.get("description", ""),
        record.get("category", ""),
        " ".join(record.get("categories") or []),
        " ".join(record.get("topics") or []),
    ]
    text = " ".join(str(part).lower() for part in text_parts if part)
    found = [platform for platform in PLATFORMS if platform in text]
    return found or ["other"]


def _list_value(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return [str(value)]


def _search_text(record: dict[str, Any], source_type: str, platforms: list[str]) -> str:
    values = [
        source_type,
        record.get("full_name", ""),
        record.get("description", ""),
        record.get("language", ""),
        record.get("category", ""),
        " ".join(_list_value(record.get("categories"))),
        " ".join(_list_value(record.get("use_cases"))),
        " ".join(_list_value(record.get("topics"))),
        " ".join(platforms),
    ]
    return " ".join(str(value).lower() for value in values if value).strip()


def normalize_record(record: dict[str, Any], source_type: str, rank: int) -> dict[str, Any]:
    full_name = str(record.get("full_name") or "")
    name = full_name.rsplit("/", 1)[-1] if "/" in full_name else full_name
    platforms = infer_platforms(record)
    categories = _list_value(record.get("categories") or record.get("category"))
    use_cases = _list_value(record.get("use_cases"))
    topics = _list_value(record.get("topics"))
    stars = int(record.get("stars") or 0)
    updated_at = record.get("updated_at") or ""

    item = {
        "id": f"{source_type}:{record.get('id') or full_name}",
        "source_id": record.get("id"),
        "name": name,
        "full_name": full_name,
        "url": record.get("url") or (f"https://github.com/{full_name}" if full_name else ""),
        "description": record.get("description") or "",
        "source_type": source_type,
        "platforms": platforms,
        "categories": categories,
        "use_cases": use_cases,
        "topics": topics,
        "language": record.get("language") or "",
        "stars": stars,
        "forks": int(record.get("forks") or 0),
        "created_at": record.get("created_at") or "",
        "updated_at": updated_at,
        "rank_signals": {
            "rank": rank,
            "stars": stars,
            "recently_updated": bool(updated_at),
            "hot": stars >= 10000,
        },
        "install": {
            "status": "manual_review",
            "repo_url": record.get("url") or (f"https://github.com/{full_name}" if full_name else ""),
            "readme_url": f"https://github.com/{full_name}#readme" if full_name else "",
            "notes": "Review the repository README for client-specific installation steps.",
        },
    }
    item["search_text"] = _search_text(
        {
            **record,
            "categories": categories,
            "use_cases": use_cases,
            "topics": topics,
        },
        source_type,
        platforms,
    )
    return item


def build_discovery_index(project_root: Path) -> dict[str, Any]:
    data_dir = project_root / "data"
    items: list[dict[str, Any]] = []
    sources: dict[str, Any] = {}

    for source_type, file_name in SOURCE_FILES.items():
        payload = load_json(data_dir / file_name)
        repos = payload.get("repos") or []
        sources[source_type] = {
            "file": f"data/{file_name}",
            "updated_at": payload.get("meta", {}).get("updated_at", ""),
            "count": len(repos),
        }
        for rank, record in enumerate(repos, start=1):
            items.append(normalize_record(record, source_type, rank))

    return {
        "meta": {
            "updated_at": now_iso(),
            "total": len(items),
            "generator": "scripts/build_discovery_index.py",
            "schema_version": 1,
        },
        "sources": sources,
        "items": items,
    }


def write_index_files(index: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(index, ensure_ascii=False, indent=2)
    (out_dir / "discovery_index.json").write_text(text + "\n", encoding="utf-8")
    (out_dir / "discovery_index.js").write_text(
        "window.DISCOVERY_INDEX = " + text + ";\n",
        encoding="utf-8",
    )
```

- [ ] **Step 5: Add the build script**

Create `scripts/build_discovery_index.py`:

```python
#!/usr/bin/env python3
from pathlib import Path

from mcp.skills_discovery.index import build_discovery_index, write_index_files


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    index = build_discovery_index(project_root)
    write_index_files(index, project_root / "data")
    print(f"Wrote {index['meta']['total']} discovery records")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run tests and build the generated index**

Run:

```bash
python3 -m unittest tests.test_discovery_index -v
python3 scripts/build_discovery_index.py
```

Expected: tests pass and the script prints `Wrote <number> discovery records`.

- [ ] **Step 7: Commit task 1**

```bash
git add mcp/skills_discovery/__init__.py mcp/skills_discovery/index.py scripts/build_discovery_index.py tests/test_discovery_index.py data/discovery_index.json data/discovery_index.js
git commit -m "feat: build discovery index"
```

## Task 2: Deterministic Search, Ranking, And Install Guidance

**Files:**
- Create: `mcp/skills_discovery/search.py`
- Create: `tests/test_discovery_search.py`

- [ ] **Step 1: Write failing search tests**

Create `tests/test_discovery_search.py`:

```python
import unittest

from mcp.skills_discovery.search import (
    get_install_instructions,
    recommend_for_task,
    search_catalog,
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
    def test_search_catalog_filters_and_scores(self):
        result = search_catalog(ITEMS, query="codex testing", platform="codex", source_type="skill", limit=5)

        self.assertEqual(result["items"][0]["full_name"], "acme/codex-tdd")
        self.assertIn("codex", result["items"][0]["match_reason"].lower())
        self.assertEqual(result["meta"]["count"], 1)

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest tests.test_discovery_search -v
```

Expected: fail with `ModuleNotFoundError` or missing functions in `mcp.skills_discovery.search`.

- [ ] **Step 3: Implement search helpers**

Create `mcp/skills_discovery/search.py`:

```python
from __future__ import annotations

import re
from datetime import datetime
from typing import Any


TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff/+#.-]+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text or "")]


def _matches_filter(item: dict[str, Any], source_type: str = "", platform: str = "", use_case: str = "", min_stars: int = 0) -> bool:
    if source_type and item.get("source_type") != source_type:
        return False
    if platform and platform not in item.get("platforms", []):
        return False
    if use_case and use_case not in item.get("use_cases", []):
        return False
    if min_stars and int(item.get("stars") or 0) < min_stars:
        return False
    return True


def _score_item(item: dict[str, Any], query: str, platform: str = "", use_case: str = "") -> tuple[int, list[str]]:
    tokens = tokenize(query)
    search_text = item.get("search_text", "").lower()
    full_name = item.get("full_name", "").lower()
    description = item.get("description", "").lower()
    score = 0
    reasons: list[str] = []

    for token in tokens:
        if token in full_name:
            score += 8
            reasons.append(f"name matches {token}")
        if token in description:
            score += 5
            reasons.append(f"description matches {token}")
        if token in search_text:
            score += 2

    if platform and platform in item.get("platforms", []):
        score += 10
        reasons.append(f"platform matches {platform}")
    if use_case and use_case in item.get("use_cases", []):
        score += 10
        reasons.append(f"use case matches {use_case}")
    score += min(int(item.get("stars") or 0) // 1000, 20)
    return score, reasons


def _compact_item(item: dict[str, Any], score: int = 0, reasons: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "full_name": item.get("full_name"),
        "name": item.get("name"),
        "description": item.get("description"),
        "source_type": item.get("source_type"),
        "platforms": item.get("platforms", []),
        "use_cases": item.get("use_cases", []),
        "stars": item.get("stars", 0),
        "language": item.get("language", ""),
        "updated_at": item.get("updated_at", ""),
        "url": item.get("url", ""),
        "score": score,
        "match_reason": ", ".join(dict.fromkeys(reasons or [])) or "high ranking match",
    }


def search_catalog(
    items: list[dict[str, Any]],
    query: str = "",
    source_type: str = "",
    platform: str = "",
    use_case: str = "",
    min_stars: int = 0,
    limit: int = 10,
) -> dict[str, Any]:
    scored: list[tuple[int, dict[str, Any], list[str]]] = []
    for item in items:
        if not _matches_filter(item, source_type, platform, use_case, min_stars):
            continue
        score, reasons = _score_item(item, query, platform, use_case)
        if query and score <= min(int(item.get("stars") or 0) // 1000, 20):
            continue
        scored.append((score, item, reasons))

    scored.sort(key=lambda row: (row[0], int(row[1].get("stars") or 0)), reverse=True)
    result_items = [_compact_item(item, score, reasons) for score, item, reasons in scored[:limit]]
    return {
        "answer_summary": f"Found {len(result_items)} matching catalog items." if result_items else "No matching catalog items found.",
        "items": result_items,
        "meta": {
            "count": len(result_items),
            "filters": {
                "query": query,
                "source_type": source_type,
                "platform": platform,
                "use_case": use_case,
                "min_stars": min_stars,
                "limit": limit,
            },
        },
    }


def recommend_for_task(items: list[dict[str, Any]], task: str, platform: str = "", limit: int = 5) -> dict[str, Any]:
    result = search_catalog(items, query=task, source_type="skill", platform=platform, limit=limit)
    for item in result["items"]:
        item["why"] = f"Recommended because {item['match_reason']} and it has {item['stars']} stars."
    result["answer_summary"] = f"Recommended {len(result['items'])} skills for: {task}" if result["items"] else "No recommendations found for that task."
    return result


def _parse_date(value: str) -> datetime:
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return datetime.min


def top_rankings(
    items: list[dict[str, Any]],
    source_type: str = "",
    platform: str = "",
    use_case: str = "",
    sort: str = "stars",
    limit: int = 10,
) -> dict[str, Any]:
    filtered = [item for item in items if _matches_filter(item, source_type, platform, use_case)]
    if sort == "recently_updated":
        filtered.sort(key=lambda item: (_parse_date(item.get("updated_at", "")), int(item.get("stars") or 0)), reverse=True)
    else:
        filtered.sort(key=lambda item: int(item.get("stars") or 0), reverse=True)

    result_items = [_compact_item(item) for item in filtered[:limit]]
    return {
        "answer_summary": f"Top {len(result_items)} catalog items sorted by {sort}.",
        "items": result_items,
        "meta": {"count": len(result_items), "sort": sort},
    }


def get_install_instructions(items: list[dict[str, Any]], repo_full_name: str, client: str = "generic") -> dict[str, Any]:
    match = next((item for item in items if item.get("full_name") == repo_full_name), None)
    if not match:
        return {
            "answer_summary": f"No catalog item found for {repo_full_name}.",
            "items": [],
            "meta": {"count": 0, "client": client},
        }

    install = match.get("install") or {}
    guidance = {
        "repo_full_name": repo_full_name,
        "client": client,
        "status": install.get("status", "manual_review"),
        "repo_url": install.get("repo_url") or match.get("url", ""),
        "readme_url": install.get("readme_url") or f"{match.get('url', '')}#readme",
        "instructions": [
            f"Open the repository README for {repo_full_name}.",
            f"Use the instructions for {client} if the project documents them.",
            "Do not run install commands until you have reviewed the repository.",
        ],
    }
    return {
        "answer_summary": f"{repo_full_name} requires manual review before installing in {client}.",
        "items": [guidance],
        "meta": {"count": 1, "client": client},
    }
```

- [ ] **Step 4: Run search tests**

Run:

```bash
python3 -m unittest tests.test_discovery_search -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit task 2**

```bash
git add mcp/skills_discovery/search.py tests/test_discovery_search.py
git commit -m "feat: add discovery search"
```

## Task 3: Remote Cache And Catalog Status

**Files:**
- Create: `mcp/skills_discovery/cache.py`
- Create: `tests/test_discovery_cache.py`

- [ ] **Step 1: Write failing cache tests**

Create `tests/test_discovery_cache.py`:

```python
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mcp.skills_discovery.cache import DEFAULT_INDEX_URL, CatalogCache


class CatalogCacheTests(unittest.TestCase):
    def test_refresh_writes_cache_and_status(self):
        payload = {
            "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 1},
            "items": [{"full_name": "acme/tool"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            cache = CatalogCache(cache_dir=Path(tmp), source_url=DEFAULT_INDEX_URL)
            with patch("mcp.skills_discovery.cache.fetch_json", return_value=payload):
                loaded = cache.load()

            self.assertEqual(loaded["meta"]["total"], 1)
            self.assertEqual(cache.status()["item_count"], 1)
            self.assertFalse(cache.status()["warnings"])
            self.assertTrue((Path(tmp) / "discovery_index.json").exists())

    def test_load_uses_last_good_cache_when_remote_fails(self):
        payload = {
            "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 1},
            "items": [{"full_name": "acme/cached"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "discovery_index.json"
            cache_path.write_text(json.dumps(payload), encoding="utf-8")
            cache = CatalogCache(cache_dir=Path(tmp), source_url=DEFAULT_INDEX_URL)
            with patch("mcp.skills_discovery.cache.fetch_json", side_effect=OSError("offline")):
                loaded = cache.load()

            self.assertEqual(loaded["items"][0]["full_name"], "acme/cached")
            self.assertIn("offline", " ".join(cache.status()["warnings"]))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest tests.test_discovery_cache -v
```

Expected: fail with missing `mcp.skills_discovery.cache`.

- [ ] **Step 3: Implement cache module**

Create `mcp/skills_discovery/cache.py`:

```python
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

DEFAULT_INDEX_URL = "https://agentskills.media/data/discovery_index.json"
ENV_INDEX_URL = "SKILLS_DISCOVERY_INDEX_URL"
ENV_CACHE_DIR = "SKILLS_DISCOVERY_CACHE_DIR"


def default_cache_dir() -> Path:
    root = os.environ.get(ENV_CACHE_DIR)
    if root:
        return Path(root)
    return Path.home() / ".cache" / "skills-discovery-mcp"


def fetch_json(url: str) -> dict[str, Any]:
    req = Request(url, headers={"User-Agent": "skills-discovery-mcp/0.1"})
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


class CatalogCache:
    def __init__(self, cache_dir: Path | None = None, source_url: str | None = None) -> None:
        self.cache_dir = cache_dir or default_cache_dir()
        self.source_url = source_url or os.environ.get(ENV_INDEX_URL) or DEFAULT_INDEX_URL
        self.cache_path = self.cache_dir / "discovery_index.json"
        self._catalog: dict[str, Any] | None = None
        self._warnings: list[str] = []
        self._last_refresh = ""

    def load(self) -> dict[str, Any]:
        self._warnings = []
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            catalog = fetch_json(self.source_url)
            self.cache_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            self._last_refresh = datetime.now(timezone.utc).isoformat()
            self._catalog = catalog
            return catalog
        except Exception as exc:
            self._warnings.append(f"Remote fetch failed: {exc}")
            if self.cache_path.exists():
                self._catalog = json.loads(self.cache_path.read_text(encoding="utf-8"))
                return self._catalog
            raise

    def catalog(self) -> dict[str, Any]:
        if self._catalog is None:
            return self.load()
        return self._catalog

    def items(self) -> list[dict[str, Any]]:
        return list(self.catalog().get("items") or [])

    def status(self) -> dict[str, Any]:
        catalog = self._catalog or {}
        meta = catalog.get("meta") or {}
        return {
            "source_url": self.source_url,
            "cache_path": str(self.cache_path),
            "last_refresh": self._last_refresh,
            "catalog_updated_at": meta.get("updated_at", ""),
            "item_count": len(catalog.get("items") or []),
            "warnings": list(self._warnings),
        }
```

- [ ] **Step 4: Run cache tests**

Run:

```bash
python3 -m unittest tests.test_discovery_cache -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit task 3**

```bash
git add mcp/skills_discovery/cache.py tests/test_discovery_cache.py
git commit -m "feat: add discovery catalog cache"
```

## Task 4: MCP Tool Definitions And Dispatch

**Files:**
- Create: `mcp/skills_discovery/tools.py`
- Create: `tests/test_mcp_tools.py`

- [ ] **Step 1: Write failing tool tests**

Create `tests/test_mcp_tools.py`:

```python
import unittest

from mcp.skills_discovery.tools import TOOL_NAMES, call_tool, list_tools


CATALOG = {
    "meta": {"updated_at": "2026-05-29T00:00:00+00:00", "total": 1},
    "items": [
        {
            "id": "skill:1",
            "full_name": "acme/codex-tdd",
            "name": "codex-tdd",
            "description": "TDD testing skill for Codex",
            "source_type": "skill",
            "platforms": ["codex"],
            "use_cases": ["测试"],
            "categories": ["codex"],
            "topics": ["testing"],
            "language": "Python",
            "stars": 5000,
            "updated_at": "2026-05-28T00:00:00Z",
            "url": "https://github.com/acme/codex-tdd",
            "install": {"status": "manual_review", "repo_url": "https://github.com/acme/codex-tdd"},
            "search_text": "skill acme/codex-tdd tdd testing skill for codex testing",
        }
    ],
}


class FakeCache:
    def catalog(self):
        return CATALOG

    def items(self):
        return CATALOG["items"]

    def status(self):
        return {
            "source_url": "https://example.com/discovery_index.json",
            "cache_path": "/tmp/discovery_index.json",
            "last_refresh": "2026-05-29T00:00:00+00:00",
            "catalog_updated_at": "2026-05-29T00:00:00+00:00",
            "item_count": 1,
            "warnings": [],
        }


class McpToolsTests(unittest.TestCase):
    def test_list_tools_exposes_expected_names(self):
        names = [tool["name"] for tool in list_tools()]

        self.assertEqual(set(names), TOOL_NAMES)

    def test_call_search_catalog_returns_text_content(self):
        result = call_tool(FakeCache(), "search_catalog", {"query": "codex testing"})

        self.assertEqual(result["content"][0]["type"], "text")
        self.assertIn("acme/codex-tdd", result["content"][0]["text"])

    def test_call_catalog_status_returns_cache_status(self):
        result = call_tool(FakeCache(), "get_catalog_status", {})

        self.assertIn("item_count", result["content"][0]["text"])

    def test_unknown_tool_raises_value_error(self):
        with self.assertRaises(ValueError):
            call_tool(FakeCache(), "missing", {})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest tests.test_mcp_tools -v
```

Expected: fail with missing `mcp.skills_discovery.tools`.

- [ ] **Step 3: Implement MCP tool handlers**

Create `mcp/skills_discovery/tools.py`:

```python
from __future__ import annotations

import json
from typing import Any

from .search import get_install_instructions, recommend_for_task, search_catalog, top_rankings

TOOL_NAMES = {
    "search_catalog",
    "recommend_for_task",
    "get_top_rankings",
    "get_install_instructions",
    "get_catalog_status",
}


def _schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": "search_catalog",
            "description": "Search the daily-updated skills discovery catalog.",
            "inputSchema": _schema({
                "query": {"type": "string"},
                "source_type": {"type": "string"},
                "platform": {"type": "string"},
                "use_case": {"type": "string"},
                "min_stars": {"type": "integer"},
                "limit": {"type": "integer"},
            }),
        },
        {
            "name": "recommend_for_task",
            "description": "Recommend skills for a natural-language task.",
            "inputSchema": _schema({
                "task": {"type": "string"},
                "platform": {"type": "string"},
                "limit": {"type": "integer"},
            }, ["task"]),
        },
        {
            "name": "get_top_rankings",
            "description": "Get top catalog rankings by stars or recent updates.",
            "inputSchema": _schema({
                "source_type": {"type": "string"},
                "platform": {"type": "string"},
                "use_case": {"type": "string"},
                "sort": {"type": "string"},
                "limit": {"type": "integer"},
            }),
        },
        {
            "name": "get_install_instructions",
            "description": "Generate safe install or usage guidance for a repository.",
            "inputSchema": _schema({
                "repo_full_name": {"type": "string"},
                "client": {"type": "string"},
            }, ["repo_full_name"]),
        },
        {
            "name": "get_catalog_status",
            "description": "Show remote catalog freshness and cache status.",
            "inputSchema": _schema({}),
        },
    ]


def _content(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}]}


def call_tool(cache: Any, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    args = arguments or {}
    items = cache.items()

    if name == "search_catalog":
        return _content(search_catalog(
            items,
            query=args.get("query", ""),
            source_type=args.get("source_type", ""),
            platform=args.get("platform", ""),
            use_case=args.get("use_case", ""),
            min_stars=int(args.get("min_stars") or 0),
            limit=int(args.get("limit") or 10),
        ))
    if name == "recommend_for_task":
        return _content(recommend_for_task(
            items,
            task=args.get("task", ""),
            platform=args.get("platform", ""),
            limit=int(args.get("limit") or 5),
        ))
    if name == "get_top_rankings":
        return _content(top_rankings(
            items,
            source_type=args.get("source_type", ""),
            platform=args.get("platform", ""),
            use_case=args.get("use_case", ""),
            sort=args.get("sort", "stars"),
            limit=int(args.get("limit") or 10),
        ))
    if name == "get_install_instructions":
        return _content(get_install_instructions(
            items,
            repo_full_name=args.get("repo_full_name", ""),
            client=args.get("client", "generic"),
        ))
    if name == "get_catalog_status":
        status = cache.status()
        return _content({
            "answer_summary": f"Catalog has {status['item_count']} items from {status['source_url']}.",
            "items": [status],
            "meta": {"count": 1},
        })
    raise ValueError(f"Unknown tool: {name}")
```

- [ ] **Step 4: Run tool tests**

Run:

```bash
python3 -m unittest tests.test_mcp_tools -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit task 4**

```bash
git add mcp/skills_discovery/tools.py tests/test_mcp_tools.py
git commit -m "feat: add MCP discovery tools"
```

## Task 5: JSON-RPC Stdio MCP Server

**Files:**
- Create: `mcp/skills_discovery/server.py`
- Create: `tests/test_mcp_server.py`

- [ ] **Step 1: Write failing server tests**

Create `tests/test_mcp_server.py`:

```python
import unittest

from mcp.skills_discovery.server import handle_request


class FakeCache:
    def items(self):
        return []

    def status(self):
        return {
            "source_url": "https://example.com/discovery_index.json",
            "cache_path": "/tmp/discovery_index.json",
            "last_refresh": "",
            "catalog_updated_at": "",
            "item_count": 0,
            "warnings": [],
        }


class McpServerTests(unittest.TestCase):
    def test_initialize_response(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})

        self.assertEqual(response["id"], 1)
        self.assertEqual(response["result"]["protocolVersion"], "2024-11-05")
        self.assertIn("serverInfo", response["result"])

    def test_tools_list_response(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})

        self.assertEqual(response["id"], 2)
        self.assertTrue(response["result"]["tools"])

    def test_tools_call_response(self):
        response = handle_request(
            FakeCache(),
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "get_catalog_status", "arguments": {}},
            },
        )

        self.assertEqual(response["id"], 3)
        self.assertEqual(response["result"]["content"][0]["type"], "text")

    def test_unknown_method_returns_error(self):
        response = handle_request(FakeCache(), {"jsonrpc": "2.0", "id": 4, "method": "missing"})

        self.assertEqual(response["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest tests.test_mcp_server -v
```

Expected: fail with missing `mcp.skills_discovery.server`.

- [ ] **Step 3: Implement stdio server**

Create `mcp/skills_discovery/server.py`:

```python
from __future__ import annotations

import json
import sys
from typing import Any

from .cache import CatalogCache
from .tools import call_tool, list_tools

PROTOCOL_VERSION = "2024-11-05"


def _result(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def handle_request(cache: CatalogCache, request: dict[str, Any]) -> dict[str, Any] | None:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return _result(request_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "skills-discovery", "version": "0.1.0"},
        })
    if method == "tools/list":
        return _result(request_id, {"tools": list_tools()})
    if method == "tools/call":
        try:
            return _result(request_id, call_tool(cache, params.get("name", ""), params.get("arguments") or {}))
        except ValueError as exc:
            return _error(request_id, -32602, str(exc))
    return _error(request_id, -32601, f"Unknown method: {method}")


def main() -> None:
    cache = CatalogCache()
    try:
        cache.load()
    except Exception as exc:
        print(f"skills-discovery: failed to load catalog: {exc}", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = handle_request(cache, request)
        except Exception as exc:
            response = _error(None, -32603, str(exc))
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run server tests**

Run:

```bash
python3 -m unittest tests.test_mcp_server -v
```

Expected: all tests pass.

- [ ] **Step 5: Smoke test the server protocol**

Run:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | SKILLS_DISCOVERY_INDEX_URL=file://$(pwd)/data/discovery_index.json python3 -m mcp.skills_discovery.server
```

Expected: output contains `"tools"` and `"search_catalog"`.

- [ ] **Step 6: Commit task 5**

```bash
git add mcp/skills_discovery/server.py tests/test_mcp_server.py
git commit -m "feat: add MCP stdio server"
```

## Task 6: Workflow, Ignore Rules, And Documentation

**Files:**
- Modify: `.github/workflows/daily-update.yml`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `README.zh.md`

- [ ] **Step 1: Update daily workflow**

Modify `.github/workflows/daily-update.yml` so the fetch step ends with:

```yaml
          python3 scripts/fetch_auto_research.py
          python3 scripts/build_discovery_index.py
```

Modify the commit step's `git add` block to include:

```yaml
                  data/discovery_index.json data/discovery_index.js \
```

- [ ] **Step 2: Ignore Superpowers visual companion files**

Ensure `.gitignore` contains:

```gitignore
/.superpowers
```

- [ ] **Step 3: Add English README MCP section**

Add this section to `README.md` near Quick Start:

```markdown
## MCP Skill Discovery

This repository publishes a daily `data/discovery_index.json` catalog that can be queried from MCP-compatible AI clients.

Run the local MCP server:

```bash
python3 -m mcp.skills_discovery.server
```

Optional development override:

```bash
SKILLS_DISCOVERY_INDEX_URL=file:///absolute/path/to/data/discovery_index.json python3 -m mcp.skills_discovery.server
```

Example chat queries:

- "Find Codex testing skills with more than 1k stars."
- "Recommend UI/UX skills for Claude Code."
- "Show the top MCP servers for browser automation."
- "How do I install acme/example-skill?"

The server only returns guidance and links. It does not execute install commands on your machine.
```

- [ ] **Step 4: Add Chinese README MCP section**

Add this section to `README.zh.md` near 快速开始:

```markdown
## MCP 技能发现助手

本仓库每天发布 `data/discovery_index.json` 统一目录，可被支持 MCP 的 AI 客户端检索。

启动本地 MCP server：

```bash
python3 -m mcp.skills_discovery.server
```

开发时可指定本地索引：

```bash
SKILLS_DISCOVERY_INDEX_URL=file:///absolute/path/to/data/discovery_index.json python3 -m mcp.skills_discovery.server
```

示例问题：

- “找 Codex 可用的测试 skills，stars 超过 1k。”
- “推荐 Claude Code 的 UI/UX skills。”
- “浏览器自动化相关的 MCP server 排行。”
- “acme/example-skill 怎么安装？”

MCP server 只返回说明和链接，不会在你的机器上执行安装命令。
```

- [ ] **Step 5: Run documentation-adjacent checks**

Run:

```bash
python3 scripts/build_discovery_index.py
python3 -m unittest discover -s tests -v
```

Expected: generated index succeeds and all tests pass.

- [ ] **Step 6: Commit task 6**

```bash
git add .github/workflows/daily-update.yml .gitignore README.md README.zh.md data/discovery_index.json data/discovery_index.js
git commit -m "docs: document MCP discovery server"
```

## Task 7: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full Python test suite**

Run:

```bash
python3 -m unittest discover -s tests -v
```

Expected: all tests pass.

- [ ] **Step 2: Rebuild generated discovery index**

Run:

```bash
python3 scripts/build_discovery_index.py
```

Expected: prints `Wrote <number> discovery records`.

- [ ] **Step 3: Verify generated files are stable**

Run:

```bash
git status --short
```

Expected: no unexpected modified files after the final build, or only intentional generated `data/discovery_index.*` changes already staged/committed.

- [ ] **Step 4: Smoke test MCP tools/list**

Run:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | SKILLS_DISCOVERY_INDEX_URL=file://$(pwd)/data/discovery_index.json python3 -m mcp.skills_discovery.server
```

Expected: JSON response includes `"search_catalog"`, `"recommend_for_task"`, `"get_top_rankings"`, `"get_install_instructions"`, and `"get_catalog_status"`.

- [ ] **Step 5: Smoke test MCP tool call**

Run:

```bash
printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_catalog","arguments":{"query":"codex testing","source_type":"skill","limit":3}}}\n' | SKILLS_DISCOVERY_INDEX_URL=file://$(pwd)/data/discovery_index.json python3 -m mcp.skills_discovery.server
```

Expected: JSON response contains `"answer_summary"` and an `"items"` array.

- [ ] **Step 6: Summarize final state**

Run:

```bash
git log --oneline -5
git status --short
```

Expected: recent commits show each implementation task and the working tree has no unrelated staged changes.

## Self-Review Notes

- Spec coverage: index generation is covered by Task 1; deterministic search and ranking by Task 2; remote cache by Task 3; MCP tools by Task 4; JSON-RPC stdio server by Task 5; workflow/docs/gitignore by Task 6; verification by Task 7.
- Red-flag scan: no unresolved package-format decisions remain in the plan.
- Type consistency: catalog items use `source_type`, `platforms`, `use_cases`, `rank_signals`, `install`, and `search_text` consistently across index, search, tools, and server tasks.
