# Agent Skills Leaderboard

<img src="favicon.svg" width="48" alt="logo" align="right" />

A leaderboard for tracking trending AI Skills and Auto Research repositories on GitHub.

**[中文文档](README.zh.md)**

---

## Features

| Feature | Description |
|---------|-------------|
| 🌐 **Two Boards** | Skills Leaderboard + Auto Research Leaderboard |
| 🔍 **Multi-filter** | Keyword search, language, Stars threshold (All / 500+ / 1k+ / 5k+ / 10k+), time range |
| 🏷️ **Use-case chips** | Click tags to filter by use case — multi-select with OR logic |
| ⊞ **Dual views** | Grid / List view toggle, 24 / 48 / 96 items per page |
| ❤️ **Favorites** | Bookmark repos; persisted in localStorage |
| 🌐 **i18n** | Switch between English and Chinese with one click |
| 🌙 **Theme** | Dark mode (default) / Light mode toggle |
| 📊 **Auto tagging** | Parses repo description + topics to assign use-case labels |
| 📄 **Pagination** | Smart pagination with ellipsis |

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url>
cd skills-tracker

# 2. Fetch data (Python 3.8+, no extra dependencies)
python3 fetch_data.py
python3 fetch_auto_research.py

# Optional: supply a GitHub Token to raise the API rate limit (60 → 5000 req/hr)
python3 fetch_data.py --token ghp_xxxxxxxxxxxx
python3 fetch_auto_research.py --token ghp_xxxxxxxxxxxx

# 3. Serve locally (recommended to avoid CORS issues)
python3 -m http.server 8080
# then open http://localhost:8080

# Or open index.html directly in most browsers
open index.html
```

## File Structure

```
agent-skills-leaderboard/
├── index.html                  # Skills Leaderboard page
├── auto-research.html          # Auto Research Leaderboard page
├── shared.css                  # Shared styles (dark / light theme)
├── shared.js                   # Shared logic (i18n, filtering, rendering)
├── favicon.svg                 # Site logo / favicon
│
├── fetch_data.py               # Crawl Skills repos → data.js
├── fetch_auto_research.py      # Crawl Research repos → auto_research_data.js
│
├── data.json                   # Skills data (human-readable, editable)
├── data.js                     # Skills data (browser-ready, auto-generated)
├── auto_research_data.json     # Research data
└── auto_research_data.js       # Research data (browser-ready, auto-generated)
```

## Automated Weekly Update (GitHub Actions)

The workflow at `.github/workflows/weekly-update.yml` runs every **Monday at 02:00 UTC**, fetches fresh data, and commits the updated `data.js` / `auto_research_data.js` back to the repo automatically.

**Setup (one-time):**

1. Go to **Settings → Secrets and variables → Actions** in your GitHub repo.
2. Add a secret named **`GH_TOKEN`** with a [Personal Access Token](https://github.com/settings/tokens) (no special scopes needed — public repo access is sufficient).
3. Push this repo to GitHub. The workflow will run on schedule.

You can also trigger it manually via **Actions → Weekly Data Update → Run workflow**.

**Manual update (local):**

```bash
python3 fetch_data.py [--token ghp_xxx]
python3 fetch_auto_research.py [--token ghp_xxx]
```

> Without a token the GitHub API allows 60 requests/hour. A token raises this to 5 000/hour. The scripts include a 0.4 s throttle between requests.

## Inclusion Criteria

| | Skills Board | Research Board |
|-|-------------|----------------|
| Min stars | ★ 100+ | ★ 100+ |
| Keywords | claude / codex / cursor / copilot / skill | deep research / autonomous / literature / RAG … |
| Categories | Claude · Codex · Cursor · Copilot · Other AI | Deep Research · Web Research · Literature · Data Analysis · Knowledge Base |

## Use-case Tags

The fetch scripts auto-assign tags via regex on `name + description + topics`:

| Tag | Matched patterns |
|-----|-----------------|
| AI Agents | agent, agentic, autonomous |
| Tool Integration | mcp, tool call, plugin, extension |
| Workflow Automation | workflow, automat, pipeline |
| Knowledge Mgmt | knowledge base, second brain, obsidian, rag |
| Code Generation | code gen, generation, coding assistant |
| UI/UX Design | ui, ux, design, frontend, slides |
| Writing / Content | writing, content, humanize, marketing |
| … | 20+ tags total |

## Tech Stack

- **Pure HTML + CSS + JS** — no framework, no build step
- **Python 3 stdlib only** — `urllib` only, no `pip install` needed
- **GitHub REST Search API** — public endpoint, token optional

## Contributing

PRs welcome to improve search queries, use-case tag rules, or the UI!
