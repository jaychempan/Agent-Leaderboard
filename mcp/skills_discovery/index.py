import json
from datetime import datetime, timezone
from pathlib import Path


SOURCE_FILES = {
    "skill": "data.json",
    "mcp": "mcp_data.json",
    "prompt": "prompts_data.json",
    "framework": "frameworks_data.json",
    "auto_research": "auto_research_data.json",
}

PLATFORM_ALIASES = {
    "claude": ("claude", "claude-code", "anthropic"),
    "codex": ("codex", "openai-codex", "codex-cli"),
    "cursor": ("cursor",),
    "copilot": ("copilot", "github-copilot"),
    "gemini": ("gemini", "google-gemini"),
    "deepseek": ("deepseek",),
    "openclaw": ("openclaw",),
    "hermes": ("hermes", "hermes-agent"),
    "windsurf": ("windsurf",),
    "chatgpt": ("chatgpt", "gpt"),
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _text_parts(record):
    fields = [
        record.get("full_name"),
        record.get("description"),
        record.get("category"),
        record.get("language"),
    ]
    fields.extend(_as_list(record.get("categories")))
    fields.extend(_as_list(record.get("topics")))
    fields.extend(_as_list(record.get("use_cases")))
    return [str(field) for field in fields if field not in (None, "")]


def infer_platforms(record):
    haystack = " ".join(_text_parts(record)).lower()
    platforms = []
    for platform, aliases in PLATFORM_ALIASES.items():
        if any(alias in haystack for alias in aliases):
            platforms.append(platform)
    return platforms


def normalize_record(record, source_type, rank):
    full_name = str(record.get("full_name") or "")
    name = full_name.rsplit("/", 1)[-1] if full_name else str(record.get("name") or "")
    topics = [str(value) for value in _as_list(record.get("topics"))]
    categories = [str(value) for value in _as_list(record.get("categories"))]
    use_cases = [str(value) for value in _as_list(record.get("use_cases"))]
    source_id = record.get("id")
    search_text = " ".join(_text_parts(record)).lower()

    return {
        "id": f"{source_type}:{source_id}",
        "source_id": source_id,
        "name": name,
        "full_name": full_name,
        "description": record.get("description") or "",
        "source_type": source_type,
        "platforms": infer_platforms(record),
        "category": record.get("category") or "",
        "categories": categories,
        "use_cases": use_cases,
        "topics": topics,
        "language": record.get("language") or "",
        "url": record.get("url") or "",
        "stars": record.get("stars") or 0,
        "forks": record.get("forks") or 0,
        "created_at": record.get("created_at") or "",
        "updated_at": record.get("updated_at") or "",
        "rank_signals": {
            "rank": rank,
            "stars": record.get("stars") or 0,
            "forks": record.get("forks") or 0,
            "updated_at": record.get("updated_at") or "",
        },
        "install": {
            "status": "manual_review",
            "url": record.get("url") or "",
        },
        "search_text": search_text,
    }


def build_discovery_index(project_root):
    project_root = Path(project_root)
    data_dir = project_root / "data"
    sources = {}
    items = []

    for source_type, file_name in SOURCE_FILES.items():
        path = data_dir / file_name
        payload = load_json(path)
        repos = payload.get("repos", [])
        sources[source_type] = {
            "file": file_name,
            "meta": payload.get("meta", {}),
            "total": len(repos),
        }
        for rank, record in enumerate(repos, start=1):
            items.append(normalize_record(record, source_type=source_type, rank=rank))

    return {
        "meta": {
            "updated_at": now_iso(),
            "total": len(items),
        },
        "sources": sources,
        "items": items,
    }


def write_index_files(index, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(index, ensure_ascii=False, indent=2, sort_keys=True)
    (out_dir / "discovery_index.json").write_text(json_text + "\n", encoding="utf-8")
    (out_dir / "discovery_index.js").write_text(
        "window.DISCOVERY_INDEX = " + json_text + ";\n",
        encoding="utf-8",
    )
