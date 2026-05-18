#!/usr/bin/env python3
"""
fetch_prompts.py — 从 GitHub API 爬取热门 Prompt Library 仓库，
分析 description/topics，输出 prompts_data.js

用法:
  python3 fetch_prompts.py
  python3 fetch_prompts.py --token ghp_xxx
"""
import json, os, time, sys, argparse, re
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import HTTPError

MIN_STARS = 100
PER_PAGE  = 50

QUERIES = {
    "collection": [
        f"awesome prompts llm stars:>{MIN_STARS}",
        f"topic:awesome-prompts stars:>{MIN_STARS}",
        f"prompt collection ai stars:>{MIN_STARS}",
    ],
    "system": [
        f"system prompt collection stars:>{MIN_STARS}",
        f"ai system prompts stars:>{MIN_STARS}",
    ],
    "engineering": [
        f"topic:prompt-engineering stars:>{MIN_STARS}",
        f"prompt engineering guide stars:>{MIN_STARS}",
        f"prompt techniques llm stars:>{MIN_STARS}",
    ],
    "coding": [
        f"coding prompts llm stars:>{MIN_STARS}",
        f"code generation prompt stars:>{MIN_STARS}",
    ],
    "writing": [
        f"writing prompts ai stars:>{MIN_STARS}",
        f"content generation prompt stars:>{MIN_STARS}",
    ],
    "general": [
        f"chatgpt prompts stars:>{MIN_STARS}",
        f"claude prompts stars:>{MIN_STARS}",
        f"llm prompts library stars:>{MIN_STARS}",
    ],
}

USE_CASE_RULES = [
    ("提示工程", r"prompt engineer|chain.of.thought|few.shot|zero.shot|cot"),
    ("代码生成", r"cod(e|ing)|developer|programming|software"),
    ("写作助手", r"writ|content|blog|essay|copywriting|creative"),
    ("系统提示", r"system prompt|system message|instruction"),
    ("资源列表", r"awesome|curated|collection|library|list"),
    ("角色扮演", r"roleplay|persona|character|act as"),
    ("学术写作", r"academic|research|paper|thesis|scientific"),
    ("数据分析", r"data|analys|csv|excel|sql"),
    ("图像生成", r"image|stable.diffusion|midjourney|dall.e|visual"),
    ("多语言",   r"multilingual|translation|language|chinese|japanese"),
]

CAT_META = {
    "collection":  {"label": "资源列表",   "icon": "📚", "color": "#f97316"},
    "system":      {"label": "系统提示",   "icon": "⚙️",  "color": "#10b981"},
    "engineering": {"label": "提示工程",   "icon": "🔧", "color": "#a78bfa"},
    "coding":      {"label": "代码生成",   "icon": "💻", "color": "#22d3ee"},
    "writing":     {"label": "写作助手",   "icon": "✍️",  "color": "#f59e0b"},
    "general":     {"label": "通用提示",   "icon": "📝", "color": "#8b949e"},
}

CAT_RULES = [
    ("collection",  r"awesome|curated|collection|list"),
    ("system",      r"system.prompt|system.message"),
    ("engineering", r"prompt.engineer|technique|guide|best.pract"),
    ("coding",      r"cod(e|ing)|programm|develop"),
    ("writing",     r"writ|content|blog|essay"),
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
    return found or ["通用提示"]

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

    print("📝 爬取 Prompt Library 仓库 …")
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

    # ── 增量合并：与现有数据合并，防止 API 限流导致数据丢失 ────────────────────
    if os.path.exists("prompts_data.json"):
        try:
            with open("prompts_data.json", "r", encoding="utf-8") as f:
                existing = {r["id"]: r for r in json.load(f).get("repos", [])}
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
            "type":       "prompts",
        },
        "categories":     categories_meta,
        "use_case_stats": uc_dist,
        "repos":          repos,
    }

    with open("prompts_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ prompts_data.json 写入完成，共 {len(repos)} 个仓库")

    js = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    with open("prompts_data.js", "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED — run fetch_prompts.py to update */\n")
        f.write(f"window.PROMPTS_DATA={js};\n")
    print("✅ prompts_data.js 写入完成")

    # ── 更新 prompts.html 中的版本号 (防缓存) ────────────────────────────────
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with open("prompts.html", "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'prompts_data\.js\?v=\d+', f'prompts_data.js?v={version}', html)
    with open("prompts.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ prompts.html 版本号更新为 {version}")

    print("\n📊 用途分布:")
    for uc, cnt in list(uc_dist.items())[:8]:
        print(f"  {uc:<12} {'█'*min(cnt,20)} {cnt}")

if __name__ == "__main__":
    main()
