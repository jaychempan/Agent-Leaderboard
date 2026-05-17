#!/usr/bin/env python3
"""
fetch_mcp.py — 从 GitHub API 爬取热门 MCP Server 仓库，
分析 description/topics，输出 mcp_data.js

用法:
  python3 fetch_mcp.py
  python3 fetch_mcp.py --token ghp_xxx
"""
import json, time, sys, argparse, re
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import HTTPError

MIN_STARS = 100
PER_PAGE  = 50

QUERIES = {
    "official": [
        f"topic:mcp-server stars:>{MIN_STARS}",
        f"model-context-protocol anthropic stars:>{MIN_STARS}",
    ],
    "database": [
        f"mcp database server stars:>{MIN_STARS}",
        f"topic:mcp postgresql stars:>{MIN_STARS}",
    ],
    "filesystem": [
        f"mcp filesystem server stars:>{MIN_STARS}",
    ],
    "web": [
        f"mcp web browser stars:>{MIN_STARS}",
        f"mcp web search stars:>{MIN_STARS}",
    ],
    "dev_tools": [
        f"mcp github server stars:>{MIN_STARS}",
        f"mcp docker git stars:>{MIN_STARS}",
    ],
    "productivity": [
        f"mcp calendar email notion stars:>{MIN_STARS}",
    ],
    "general": [
        f"topic:model-context-protocol stars:>{MIN_STARS}",
        f"awesome mcp servers stars:>{MIN_STARS}",
        f"mcp server claude stars:>{MIN_STARS}",
    ],
}

USE_CASE_RULES = [
    ("数据库连接", r"database|postgres|mysql|sqlite|redis|mongo|sql"),
    ("文件系统",   r"filesystem|file system|local file|directory"),
    ("网页浏览",   r"browser|browse|web search|scraping|puppeteer|playwright"),
    ("代码工具",   r"github|git|docker|ci|code|develop|terminal"),
    ("生产力",     r"calendar|email|notion|slack|jira|trello|todo|productivity"),
    ("官方服务器", r"official|anthropic|reference|example"),
    ("API集成",    r"api|integration|connector|webhook"),
    ("资源列表",   r"awesome|curated|collection|list"),
    ("搜索",       r"search|retrieval|query"),
    ("通用MCP",    r"mcp|model.context|context.protocol"),
]

CAT_META = {
    "official":    {"label": "官方服务器", "icon": "🏢", "color": "#f97316"},
    "database":    {"label": "数据库",     "icon": "🗄️",  "color": "#10b981"},
    "filesystem":  {"label": "文件系统",   "icon": "📁",  "color": "#a78bfa"},
    "web":         {"label": "网页工具",   "icon": "🌐",  "color": "#22d3ee"},
    "dev_tools":   {"label": "开发工具",   "icon": "🛠️",  "color": "#f59e0b"},
    "productivity":{"label": "生产力",     "icon": "📅",  "color": "#8b949e"},
    "general":     {"label": "通用MCP",    "icon": "🔌",  "color": "#58a6ff"},
}

CAT_RULES = [
    ("official",   r"official|anthropic|reference"),
    ("database",   r"database|postgres|mysql|sqlite|redis|mongo"),
    ("filesystem", r"filesystem|file.?system"),
    ("web",        r"browser|web.search|scraping|playwright"),
    ("dev_tools",  r"github|docker|git|terminal|code|develop"),
]

def gh_get(url, token):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "skills-tracker/1.0"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except HTTPError as e:
        body = e.read().decode()
        print(f"  ⚠️  HTTP {e.code}: {body[:120]}", file=sys.stderr)
        raise

def search_repos(query, token, per_page=PER_PAGE):
    from urllib.parse import quote
    url = f"https://api.github.com/search/repositories?q={quote(query)}&sort=stars&order=desc&per_page={per_page}"
    return gh_get(url, token).get("items", [])

def analyze_use_cases(repo):
    text = " ".join([repo.get("name",""), repo.get("description","") or "", " ".join(repo.get("topics",[]))]).lower()
    found = [label for label, pat in USE_CASE_RULES if re.search(pat, text)]
    return found or ["通用MCP"]

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
    token = args.token

    print("🔌 爬取 MCP Servers 仓库 …")
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
                    if raw["id"] in seen or raw["stargazers_count"] < MIN_STARS:
                        continue
                    seen.add(raw["id"])
                    repos.append(normalize(raw, cat))
                    new += 1
                print(f"    +{new} repos (total {len(repos)})")
            except Exception as e:
                print(f"    ✗ 跳过: {e}", file=sys.stderr)
            time.sleep(0.4)

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
            "type":       "mcp",
        },
        "categories":     categories_meta,
        "use_case_stats": uc_dist,
        "repos":          repos,
    }

    with open("mcp_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ mcp_data.json 写入完成，共 {len(repos)} 个仓库")

    js = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    with open("mcp_data.js", "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED — run fetch_mcp.py to update */\n")
        f.write(f"window.MCP_DATA={js};\n")
    print("✅ mcp_data.js 写入完成")

    # ── 更新 mcp.html 中的版本号 (防缓存) ────────────────────────────────────
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with open("mcp.html", "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'mcp_data\.js\?v=\d+', f'mcp_data.js?v={version}', html)
    with open("mcp.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ mcp.html 版本号更新为 {version}")

    print("\n📊 用途分布:")
    for uc, cnt in list(uc_dist.items())[:8]:
        print(f"  {uc:<12} {'█'*min(cnt,20)} {cnt}")

if __name__ == "__main__":
    main()
