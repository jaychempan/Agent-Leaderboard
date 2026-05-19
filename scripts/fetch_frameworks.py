#!/usr/bin/env python3
"""
fetch_frameworks.py — 从 GitHub API 爬取热门 AI Agent Framework 仓库，
分析 description/topics，输出 frameworks_data.js

用法:
  python3 fetch_frameworks.py
  python3 fetch_frameworks.py --token ghp_xxx
"""
import json, os, time, sys, argparse, re
from datetime import datetime, timezone
from fetch_utils import load_token, gh_get, search_repos

MIN_STARS = 50
PER_PAGE  = 100

# ── 内容过滤：黑名单 + 政治敏感关键词 ────────────────────────────────────────
REPO_BLOCKLIST = {
    "cirosantilli/china-dictatorship",
    "zszszszsz/.config",
    "huggingface/transformers",
}
_SENSITIVE_RE = re.compile(
    r'\bdictatorship\b|china-dictatorship|\btiananmen\b'
    r'|\bfalun[- ]?(gong|dafa)\b|\bfree[- ]tibet\b'
    r'|\bgenocide\b|\buyghur\b',
    re.IGNORECASE,
)
def is_blocked(repo: dict) -> bool:
    if repo.get("full_name") in REPO_BLOCKLIST:
        return True
    repo_name = repo.get("full_name","").split("/")[-1]
    if repo_name.startswith("."):
        return True
    if repo_name.endswith(".github.io"):
        return True
    text = " ".join([repo.get("full_name",""), repo.get("description","") or "",
                     " ".join(repo.get("topics",[]))])
    return bool(_SENSITIVE_RE.search(text))

_RELEVANT_RE = re.compile(r'\bframework|platform|library|sdk|toolkit|engine\b', re.I)
def is_relevant(repo: dict) -> bool:
    name_desc = repo.get("full_name","") + " " + (repo.get("description","") or "")
    return bool(_RELEVANT_RE.search(name_desc))

QUERIES = {
    "general": [
        f"llm framework in:name stars:>{MIN_STARS}",
        f"agent framework in:name stars:>{MIN_STARS}",
        f"llm agent in:name stars:>{MIN_STARS}",
        f"llm framework in:description stars:>{MIN_STARS}",
        f"agent framework in:description stars:>{MIN_STARS}",
        f"topic:agent-framework stars:>{MIN_STARS}",
        f"topic:llm-framework stars:>{MIN_STARS}",
        f"topic:ai-agent stars:>{MIN_STARS}",
        f"topic:langchain stars:>{MIN_STARS}",
        f"topic:llamaindex stars:>{MIN_STARS}",
        f"topic:autogen stars:>{MIN_STARS}",
        f"topic:crewai stars:>{MIN_STARS}",
        f"topic:metagpt stars:>{MIN_STARS}",
        f"topic:deepseek stars:>{MIN_STARS}",
    ],
}

USE_CASE_RULES = [
    ("多智能体", r"multi.agent|crew|swarm|collaborative|society"),
    ("工具调用", r"tool.call|function.call|tool.use|plugin|mcp"),
    ("记忆管理", r"memory|state.manag|persistent|long.term|context.manag"),
    ("流程编排", r"orchestrat|pipeline|workflow|chain|graph|flow"),
    ("代码生成", r"cod(e|ing)|software|program|develop"),
    ("评估测试", r"eval|benchmark|test|metric|assess"),
    ("RAG",      r"rag|retriev|vector|embed|knowledge"),
    ("自主代理", r"autonomous|agentic|self.refin|self.improv"),
    ("资源列表", r"awesome|curated|collection|survey|list"),
    ("语音/视觉",r"voice|speech|vision|multimodal|image"),
]

CAT_META = {
    "orchestration": {"label": "流程编排",  "icon": "🔗", "color": "#f97316"},
    "multi_agent":   {"label": "多智能体",  "icon": "🤝", "color": "#10b981"},
    "memory":        {"label": "记忆管理",  "icon": "🧠", "color": "#a78bfa"},
    "tools":         {"label": "工具调用",  "icon": "🛠️",  "color": "#22d3ee"},
    "evaluation":    {"label": "评估测试",  "icon": "📊", "color": "#f59e0b"},
    "general":       {"label": "通用框架",  "icon": "🤖", "color": "#8b949e"},
}

CAT_RULES = [
    ("orchestration", r"langchain|llamaindex|orchestrat|pipeline|chain"),
    ("multi_agent",   r"multi.agent|crew|autogen|metagpt|swarm"),
    ("memory",        r"memory|state.manag|persistent"),
    ("tools",         r"tool.call|function.call|tool.use"),
    ("evaluation",    r"eval|benchmark|metric|assess"),
]

def analyze_use_cases(repo):
    text = " ".join([repo.get("name",""), repo.get("description","") or "", " ".join(repo.get("topics",[]))]).lower()
    found = [label for label, pat in USE_CASE_RULES if re.search(pat, text)]
    return found or ["通用框架"]

def assign_category(repo, hint):
    text = " ".join([repo.get("full_name",""), repo.get("description","") or "", " ".join(repo.get("topics",[]))]).lower()
    for cat, pat in CAT_RULES:
        if re.search(pat, text): return cat
    return hint

def normalize(raw, hint):
    return {
        "id":          raw["id"],
        "full_name":   raw["full_name"],
        "description": raw.get("description") or "",
        "stars":       raw["stargazers_count"],
        "forks":       raw["forks_count"],
        "language":    raw.get("language") or "",
        "topics":      raw.get("topics") or [],
        "url":         raw["html_url"],
        "created_at":  raw["created_at"],
        "updated_at":  raw["updated_at"],
        "category":    assign_category(raw, hint),
        "use_cases":   analyze_use_cases(raw),
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", default="")
    args = parser.parse_args()
    token = load_token(args.token)

    print("🤖 爬取 AI Agent Frameworks 仓库 …")
    seen = set()
    repos = []

    for cat, queries in QUERIES.items():
        print(f"\n[{CAT_META[cat]['icon']} {cat}]")
        for q in queries:
            print(f"  › {q}")
            try:
                items = search_repos(q, token)
                new = 0
                for raw in items:
                    if raw["id"] in seen or raw["stargazers_count"] < MIN_STARS or is_blocked(raw) or not is_relevant(raw):
                        continue
                    seen.add(raw["id"])
                    repos.append(normalize(raw, cat))
                    new += 1
                print(f"    +{new} repos (total {len(repos)})")
            except Exception as e:
                print(f"    ✗ 跳过: {e}", file=sys.stderr)
            time.sleep(0.4)

    # ── 增量合并：与现有数据合并，防止 API 限流导致数据丢失 ────────────────────
    if os.path.exists("frameworks_data.json"):
        try:
            with open("data/frameworks_data.json", "r", encoding="utf-8") as f:
                existing = {r["id"]: r for r in json.load(f).get("repos", [])
                            if not is_blocked(r) and is_relevant(r)}
            if not repos:
                print("⚠️  本次搜索结果为空，保留现有数据不变")
                return
            merged = dict(existing)
            merged.update({r["id"]: r for r in repos})
            repos = list(merged.values())
            print(f"📦 增量合并: 共 {len(repos)} 条 (新增/更新 {len(repos)-len(existing)})")
        except Exception as e:
            print(f"⚠️  加载现有数据失败: {e}", file=sys.stderr)
    elif not repos:
        print("⚠️  搜索结果为空且无历史数据，跳过写入")
        return

    repos.sort(key=lambda r: r["stars"], reverse=True)

    cat_counts = {k: 0 for k in CAT_META}
    for r in repos:
        cat_counts[r["category"]] = cat_counts.get(r["category"], 0) + 1
    categories_meta = {k: {**v, "count": cat_counts.get(k,0)} for k,v in CAT_META.items()}

    uc_dist = {}
    for r in repos:
        for uc in r["use_cases"]:
            uc_dist[uc] = uc_dist.get(uc, 0) + 1
    uc_dist = dict(sorted(uc_dist.items(), key=lambda x: -x[1]))

    output = {
        "meta": {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "min_stars":  MIN_STARS,
            "total":      len(repos),
            "type":       "frameworks",
        },
        "categories":     categories_meta,
        "use_case_stats": uc_dist,
        "repos":          repos,
    }

    with open("data/frameworks_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ frameworks_data.json 写入完成，共 {len(repos)} 个仓库")

    js = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    with open("data/frameworks_data.js", "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED — run fetch_frameworks.py to update */\n")
        f.write(f"window.FRAMEWORKS_DATA={js};\n")
    print("✅ frameworks_data.js 写入完成")

    # ── 更新 frameworks.html 中的版本号 (防缓存) ─────────────────────────────
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'data/frameworks_data.js?v=\d+', f'frameworks_data.js?v={version}', html)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ index.html 版本号更新为 {version}")

    print("\n📊 用途分布:")
    for uc, cnt in list(uc_dist.items())[:8]:
        print(f"  {uc:<12} {'█'*min(cnt,20)} {cnt}")

if __name__ == "__main__":
    main()
