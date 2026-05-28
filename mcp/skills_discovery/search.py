from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional


TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff/+#.-]+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text or "")]


def _list_value(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    return [str(value)] if value != "" else []


def _matches_filter(
    item: dict[str, Any],
    source_type: str = "",
    platform: str = "",
    use_case: str = "",
    min_stars: int = 0,
) -> bool:
    if source_type and item.get("source_type") != source_type:
        return False
    if platform and platform not in _list_value(item.get("platforms")):
        return False
    if use_case and use_case not in _list_value(item.get("use_cases")):
        return False
    if min_stars and int(item.get("stars") or 0) < min_stars:
        return False
    return True


def _score_item(
    item: dict[str, Any],
    query: str,
    platform: str = "",
    use_case: str = "",
) -> tuple[int, list[str], bool]:
    tokens = tokenize(query)
    full_name = str(item.get("full_name") or "").lower()
    description = str(item.get("description") or "").lower()
    search_text = str(item.get("search_text") or "").lower()
    platforms = _list_value(item.get("platforms"))
    use_cases = _list_value(item.get("use_cases"))
    score = min(int(item.get("stars") or 0) // 1000, 20)
    reasons: list[str] = []
    query_matched = not tokens

    for token in tokens:
        token_matched = False
        if token in full_name:
            score += 8
            token_matched = True
            reasons.append(f"name matches {token}")
        if token in description:
            score += 5
            token_matched = True
            reasons.append(f"description matches {token}")
        if token in search_text:
            score += 2
            token_matched = True
        query_matched = query_matched or token_matched

    if platform and platform in platforms:
        score += 10
        reasons.append(f"platform matches {platform}")
    if use_case and use_case in use_cases:
        score += 10
        reasons.append(f"use case matches {use_case}")

    return score, reasons, query_matched


def _unique_reasons(reasons: list[str]) -> list[str]:
    return list(dict.fromkeys(reasons))


def _compact_item(item: dict[str, Any], score: int = 0, reasons: Optional[list[str]] = None) -> dict[str, Any]:
    unique_reasons = _unique_reasons(reasons or [])
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
        "match_reason": ", ".join(unique_reasons) or "high ranking match",
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
    scored: list[tuple[int, int, str, dict[str, Any], list[str]]] = []
    for item in items:
        if not _matches_filter(item, source_type, platform, use_case, min_stars):
            continue
        score, reasons, query_matched = _score_item(item, query, platform, use_case)
        if query and not query_matched:
            continue
        scored.append((score, int(item.get("stars") or 0), str(item.get("full_name") or ""), item, reasons))

    scored.sort(key=lambda row: (-row[0], -row[1], row[2]))
    result_items = [_compact_item(item, score, reasons) for score, _stars, _name, item, reasons in scored[:limit]]
    count = len(result_items)

    return {
        "answer_summary": f"Found {count} matching catalog items." if count else "No matching catalog items found.",
        "items": result_items,
        "meta": {
            "count": count,
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
    count = result["meta"]["count"]
    result["answer_summary"] = (
        f"Recommended {count} skills for: {task}" if count else "No recommendations found for that task."
    )
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
        filtered.sort(
            key=lambda item: (
                _parse_date(str(item.get("updated_at") or "")),
                int(item.get("stars") or 0),
                str(item.get("full_name") or ""),
            ),
            reverse=True,
        )
    else:
        sort = "stars"
        filtered.sort(key=lambda item: (-int(item.get("stars") or 0), str(item.get("full_name") or "")))

    result_items = [_compact_item(item) for item in filtered[:limit]]
    count = len(result_items)
    return {
        "answer_summary": f"Top {count} catalog items sorted by {sort}." if count else "No matching catalog items found.",
        "items": result_items,
        "meta": {
            "count": count,
            "sort": sort,
            "filters": {
                "source_type": source_type,
                "platform": platform,
                "use_case": use_case,
                "limit": limit,
            },
        },
    }


def get_install_instructions(
    items: list[dict[str, Any]],
    repo_full_name: str,
    client: str = "generic",
) -> dict[str, Any]:
    match = next((item for item in items if item.get("full_name") == repo_full_name), None)
    if not match:
        return {
            "answer_summary": f"No catalog item found for {repo_full_name}.",
            "items": [],
            "meta": {"count": 0, "client": client, "repo_full_name": repo_full_name},
        }

    install = match.get("install") or {}
    repo_url = install.get("repo_url") or match.get("url", "")
    readme_url = install.get("readme_url") or (f"{repo_url}#readme" if repo_url else "")
    guidance = {
        "repo_full_name": repo_full_name,
        "client": client,
        "status": install.get("status", "manual_review"),
        "repo_url": repo_url,
        "readme_url": readme_url,
        "notes": install.get("notes", ""),
        "instructions": [
            f"Open the repository README for {repo_full_name}.",
            f"Review any documented setup steps for {client}.",
            "Inspect the repository before running any installation commands.",
            "Apply installation steps manually only after review.",
        ],
    }
    return {
        "answer_summary": f"{repo_full_name} requires manual review before installing in {client}.",
        "items": [guidance],
        "meta": {"count": 1, "client": client, "repo_full_name": repo_full_name},
    }
