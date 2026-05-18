#!/usr/bin/env python3
"""
fetch_data.py — 从 GitHub API 爬取热门 Skills 仓库，
分析 description/topics 生成 use_cases，输出 data.json + data.js

用法:
  python3 fetch_data.py
  python3 fetch_data.py --token ghp_xxx
"""
import json, os, time, sys, argparse, re
from datetime import datetime, timezone
from fetch_utils import load_token, gh_get, search_repos

# ── 配置 ─────────────────────────────────────────────────────────────────────
MIN_STARS    = 50
PER_PAGE     = 100

# ── 内容过滤：黑名单 + 政治敏感关键词 ────────────────────────────────────────
REPO_BLOCKLIST = {
    "cirosantilli/china-dictatorship",
    "zszszszsz/.config",
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

QUERIES      = {
    "claude":   [
        f"claude skill stars:>{MIN_STARS}",
        f"claude-code skill stars:>{MIN_STARS}",
        f"topic:claude-skill stars:>{MIN_STARS}",
        f"topic:claude-code stars:>{MIN_STARS}",
        f"topic:anthropic stars:>{MIN_STARS}",
        f"awesome claude skill stars:>{MIN_STARS}",
    ],
    "codex":    [
        f"openai codex stars:>{MIN_STARS}",
        f"topic:openai-codex stars:>{MIN_STARS}",
        f"topic:codex stars:>{MIN_STARS}",
        f"codex skill agent stars:>{MIN_STARS}",
    ],
    "cursor":   [
        f"cursor rules ai stars:>{MIN_STARS}",
        f"topic:cursor-rules stars:>{MIN_STARS}",
        f"topic:cursorrules stars:>{MIN_STARS}",
        f"awesome cursorrules stars:>{MIN_STARS}",
    ],
    "copilot":  [
        f"github copilot extension stars:>{MIN_STARS}",
        f"topic:github-copilot stars:>{MIN_STARS}",
        f"topic:copilot stars:>{MIN_STARS}",
        f"copilot skill stars:>{MIN_STARS}",
    ],
    "deepseek": [
        f"deepseek in:name stars:>{MIN_STARS}",
        f"topic:deepseek stars:>{MIN_STARS}",
        f"topic:deepseek-coder stars:>{MIN_STARS}",
        f"deepseek skill stars:>{MIN_STARS}",
        f"awesome deepseek stars:>{MIN_STARS}",
    ],
    "openclaw": [
        f"openclaw in:name stars:>{MIN_STARS}",
        f"topic:openclaw stars:>{MIN_STARS}",
        f"topic:clawbot stars:>{MIN_STARS}",
        f"awesome openclaw stars:>{MIN_STARS}",
        f"openclaw skill stars:>{MIN_STARS}",
    ],
    "other":    [
        f"topic:ai-skills stars:>{MIN_STARS}",
        f"topic:llm-tools stars:>{MIN_STARS}",
        f"ai skill llm agent stars:>{MIN_STARS}",
        f"gpt skill plugin stars:>{MIN_STARS}",
        f"windsurf cline skill stars:>{MIN_STARS}",
    ],
}

# ── 用途分析规则（关键词 → 用途标签）────────────────────────────────────────
USE_CASE_RULES = [
    ("资源列表",    r"awesome|curated|collection|list of|directory|resources"),
    ("代码生成",    r"code gen|generat.*code|coding assistant|write code|code writing|code completion"),
    ("代码审查",    r"code review|lint|check code|audit|static analysis"),
    ("文档生成",    r"\bdoc(s|umentation)?\b|readme|wiki|javadoc"),
    ("测试",        r"\btest(ing|s)?\b|tdd|bdd|unit test|e2e|spec"),
    ("AI 代理",     r"agent|agentic|multi.agent|orchestrat|autonomous|self.evolv"),
    ("工作流自动化",r"workflow|automat|pipeline|ci.cd|scheduled|recurring"),
    ("知识管理",    r"knowledge|memory|obsidian|note.taking|rag|retrieval|second brain"),
    ("UI/UX 设计",  r"\bui\b|\bux\b|design|frontend|slide|visual|figma|prototype|tailwind"),
    ("游戏开发",    r"game|gaming|unity|godot|unreal|game dev"),
    ("数据分析",    r"data anal|analytics|research|scientific|science|chart|dashboard"),
    ("写作/内容",   r"writ(e|ing)|content|humaniz|blog|copywriting|marketing|essay|seo"),
    ("工具集成",    r"mcp\b|tool.?call|plugin|extension|integration|bridge|gateway|proxy"),
    ("搜索",        r"search|retrieval|index|semantic search|embedding"),
    ("DevOps",      r"devops|deploy|docker|kubernetes|infra|ci.cd|helm|terraform"),
    ("安全",        r"security|vulnerab|penetrat|pentest|exploit"),
    ("任务规划",    r"plan(ning)?|task|schedule|project.?manag|roadmap"),
    ("Prompt 优化", r"prompt|token|context|compress|optimize|system.?prompt"),
    ("Web 开发",    r"web.?app|saas|next.?js|react|fullstack|backend|fastapi|django|laravel"),
    ("模型路由",    r"rout(er|ing)|proxy|gateway|load.?balanc|model.?switch|api.?hub"),
]

# ── 分类规则 ─────────────────────────────────────────────────────────────────
CATEGORY_RULES = [
    ("claude",   r"claude|anthropic"),
    ("codex",    r"codex"),
    ("cursor",   r"cursor"),
    ("copilot",  r"copilot"),
    ("deepseek", r"deepseek"),
    ("openclaw", r"openclaw"),
]

CATEGORY_META = {
    "claude":   {"label": "Claude",    "icon": "🤖", "color": "#f97316"},
    "codex":    {"label": "Codex",     "icon": "⚡", "color": "#10b981"},
    "cursor":   {"label": "Cursor",    "icon": "🎯", "color": "#a78bfa"},
    "copilot":  {"label": "Copilot",   "icon": "🚀", "color": "#22d3ee"},
    "deepseek": {"label": "DeepSeek",  "icon": "🐋", "color": "#4f86f7"},
    "openclaw": {"label": "OpenClaw",  "icon": "🦞", "color": "#e879f9"},
    "other":    {"label": "其他 AI",   "icon": "✨", "color": "#f59e0b"},
}

# ── 分析函数 ──────────────────────────────────────────────────────────────────
def analyze_use_cases(repo: dict) -> list[str]:
    text = " ".join([
        repo.get("name", ""),
        repo.get("description", "") or "",
        " ".join(repo.get("topics", [])),
    ]).lower()
    found = []
    for label, pattern in USE_CASE_RULES:
        if re.search(pattern, text):
            found.append(label)
    return found or ["通用工具"]

def assign_category(repo: dict, hint_cat: str) -> str:
    text = " ".join([
        repo.get("full_name", ""),
        repo.get("description", "") or "",
        " ".join(repo.get("topics", [])),
    ]).lower()
    for cat, pattern in CATEGORY_RULES:
        if re.search(pattern, text):
            return cat
    return hint_cat  # fall back to the search bucket

def normalize_repo(raw: dict, hint_cat: str) -> dict:
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
        "category":    assign_category(raw, hint_cat),
        "use_cases":   analyze_use_cases(raw),
    }

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", default="", help="GitHub Personal Access Token")
    args = parser.parse_args()
    token = load_token(args.token)

    print("🔍 开始爬取 GitHub Skills 仓库 …")
    seen: set[int] = set()
    repos: list[dict] = []

    for cat, queries in QUERIES.items():
        print(f"\n[{CATEGORY_META[cat]['icon']} {cat}]")
        for q in queries:
            print(f"  › {q}")
            try:
                items = search_repos(q, token)
                new = 0
                for raw in items:
                    if raw["id"] in seen or raw["stargazers_count"] < MIN_STARS or is_blocked(raw):
                        continue
                    seen.add(raw["id"])
                    repos.append(normalize_repo(raw, cat))
                    new += 1
                print(f"    +{new} repos (total {len(repos)})")
            except Exception as e:
                print(f"    ✗ 跳过: {e}", file=sys.stderr)
            time.sleep(0.4)   # gentle throttle

    # ── 增量合并：与现有数据合并，防止 API 限流导致数据丢失 ────────────────────
    if os.path.exists("data.json"):
        try:
            with open("data.json", "r", encoding="utf-8") as f:
                existing = {r["id"]: r for r in json.load(f).get("repos", [])
                            if not is_blocked(r)}   # 重新过滤旧数据中的违规条目
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

    # 统计分类数量
    cat_counts: dict[str, int] = {k: 0 for k in CATEGORY_META}
    for r in repos:
        cat_counts[r["category"]] = cat_counts.get(r["category"], 0) + 1

    categories_meta = {}
    for k, meta in CATEGORY_META.items():
        categories_meta[k] = {**meta, "count": cat_counts.get(k, 0)}

    # 统计 use_case 分布
    uc_dist: dict[str, int] = {}
    for r in repos:
        for uc in r["use_cases"]:
            uc_dist[uc] = uc_dist.get(uc, 0) + 1
    uc_dist_sorted = dict(sorted(uc_dist.items(), key=lambda x: -x[1]))

    output = {
        "meta": {
            "updated_at":    datetime.now(timezone.utc).isoformat(),
            "min_stars":     MIN_STARS,
            "total":         len(repos),
            "generator":     "fetch_data.py",
        },
        "categories": categories_meta,
        "use_case_stats": uc_dist_sorted,
        "repos": repos,
    }

    # ── 写 data.json ─────────────────────────────────────────────────────────
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ data.json 写入完成，共 {len(repos)} 个仓库")

    # ── 写 data.js (供浏览器 <script src> 加载) ──────────────────────────────
    js_payload = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    with open("data.js", "w", encoding="utf-8") as f:
        f.write(f"/* AUTO-GENERATED — run fetch_data.py to update */\n")
        f.write(f"window.SKILLS_DATA={js_payload};\n")
    print("✅ data.js 写入完成")

    # ── 更新 index.html 中的 data.js 版本号 (防缓存) ─────────────────────────
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'data\.js\?v=\d+', f'data.js?v={version}', html)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ index.html 版本号更新为 {version}")

    print("\n📊 用途分布 Top 10:")
    for uc, cnt in list(uc_dist_sorted.items())[:10]:
        bar = "█" * min(cnt, 20)
        print(f"  {uc:<12} {bar} {cnt}")

if __name__ == "__main__":
    main()
