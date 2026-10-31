# Agent Leaderboard

<img src="favicon.svg" width="48" alt="Agent Leaderboard logo" align="right" />

Discover GitHub repositories across **Agent Skills**, **MCP Servers**, **Prompt Libraries**, **AI Frameworks**, and **Auto Research**. Browse by total stars, find projects gaining momentum, or search the same catalog from Chrome and an MCP client.

[![Website](https://img.shields.io/badge/website-agentskills.media-blue?logo=googlechrome&logoColor=white)](https://agentskills.media)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-jaychempan.github.io-blue?logo=github&logoColor=white)](https://jaychempan.github.io/Agent-Leaderboard)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[中文文档](README.zh.md)** · **[Browse the boards](https://agentskills.media)** · **[Chrome extension](https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf)**

## Five boards

| Board | What it covers |
|-------|----------------|
| [Agent Skills](https://agentskills.media/#skills) | Skills and tools for Claude Code, Codex, Cursor, Copilot, Gemini, DeepSeek, OpenClaw, Hermes Agent and more |
| [MCP Servers](https://agentskills.media/#mcp) | Model Context Protocol servers for databases, files, web tools, APIs and development workflows |
| [Prompt Libraries](https://agentskills.media/#prompts) | Prompt collections, system prompts and prompt engineering resources |
| [AI Frameworks](https://agentskills.media/#frameworks) | Agent orchestration, multi-agent systems, memory and model routing |
| [Auto Research](https://agentskills.media/#research) | Deep research, literature discovery, data research and knowledge tools |

The website shows each board's repository count, data timestamp and ranking. Use the board links for current results; this README does not duplicate a manually maintained Top 10 snapshot. Boards can overlap, so their counts are not counts of unique repositories across the site.

## Trending

Click the highlighted **Trending** button in the top navigation to open the ranking on the current page. On mobile, it is inside the navigation menu. The entry briefly wiggles on its first appearance, unless reduced motion is enabled.

- **Daily + growth rate by default.** Switch to Weekly or Monthly, or sort by **Stars gained**.
- **Top 20 per board.** All five boards use the same controls; no coding-agent subcategory filter is applied inside Trending.
- **Compact rows.** Project and category icons, 🥇🥈🥉 medals for the top three, total stars, gains and percentages stay easy to compare. Large star counts use `k`; hover for exact values.
- **Minimize and resume.** Minimize to the bottom-right dock and restore the selected board, period, sort and scroll position. Close with ×, Escape or a click outside the panel. Homepage filters and scroll position stay intact.

Growth is calculated from the site's recorded daily snapshots: **stars gained = current − baseline**, and **growth rate = stars gained ÷ baseline × 100%**. Daily, weekly and monthly compare UTC dates 1, 7 and 30 days apart, relative to each dataset's update date. Only positive gains rank; missing history is excluded, and a zero baseline is excluded from growth-rate ranking. The summary's net gain includes declines.

These are observed changes in the catalog, not real-time GitHub star events: incremental collection can retain older counts. See [trend data and calculation details](docs/trending.md).

## Website features

| Feature | Behavior |
|---------|----------|
| Search and filters | Repository name/description, category, language, minimum stars and last-update time range |
| Use cases | Multiple selected use-case tags must all match |
| Grid and list | Switch views; display 24, 48 or 96 repositories per page |
| Favorites | Local browser storage; optional GitHub sign-in and private cloud sync through a configured Supabase project |
| Language and theme | Chinese/English; follows system light/dark theme until manually changed |
| Brand identification | Reuses brand and category icons across the homepage and trend panel |

### GitHub sign-in and cloud favorites

When a Supabase project is configured, website visitors can sign in with GitHub to keep favorites across devices. Existing local favorites are merged on first sign-in; account-specific caches and queued changes support offline use. Removing a favorite synchronizes a deletion marker, while signing out or clearing browser data keeps already-synced cloud records. GitHub Stars are unchanged. The Chrome extension continues to store favorites locally and does not use website sign-in.

The website remains usable without an account or cloud configuration. Enabling real sign-in requires a Supabase project, a GitHub OAuth App, the database migration and a public frontend configuration; code alone does not activate the service. See [deployment, privacy and verification steps](docs/github-favorites-setup.md). Only a Supabase publishable key or legacy anon key belongs in frontend configuration; never expose a secret/service-role key or GitHub Client Secret.

## Chrome search extension

Install from the **[Chrome Web Store](https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf)**, or visit the [bilingual showcase and usage guide](https://agentskills.media/extension/). Requires Chrome 116 or later.

Search all five boards in a side panel with categories, use cases, platform, language, stars and time filters. Save favorites, open READMEs, and copy an AI installation prompt to paste into your coding assistant. The extension generates the prompt; it does not install repositories automatically.

It also supports selected-text context-menu search, the `agent` address-bar keyword, `Ctrl+Shift+Y` / macOS `Command+Shift+Y`, and a bundled offline catalog. Extension favorites stay local to the current Chrome profile, separate from website favorites and its optional cloud sync.

For development, load **`chrome/`** through `chrome://extensions` → **Developer mode** → **Load unpacked**. Refresh the bundled catalog and build `dist/Chrome.zip` with:

```bash
python3 scripts/chrome/build.py
```

See the [extension documentation](docs/chrome-extension.md) for permissions, updates, shortcuts and testing.

## MCP skill discovery

Use the catalog directly from any AI chat client that supports MCP. This Bash command installs the server, creates an isolated venv under `~/.local/share/skills-discovery-mcp`, and configures detected clients:

```bash
curl -fsSL https://raw.githubusercontent.com/jaychempan/Agent-Leaderboard/main/scripts/install.sh \
  | SKILLS_DISCOVERY_CONFIGURE_CLIENTS=auto bash
```

Use macOS, Linux, WSL, or Git Bash for the installer. Native PowerShell does not support this Bash syntax.

For Codex, verify the server is registered, then start a new Codex session:

```bash
codex mcp list
```

Quick examples are in [`docs/mcp-quick-use.zh.md`](docs/mcp-quick-use.zh.md).

To skip client config or target specific clients:

```bash
SKILLS_DISCOVERY_CONFIGURE_CLIENTS=none bash scripts/install.sh
SKILLS_DISCOVERY_CONFIGURE_CLIENTS=codex,claude,cursor bash scripts/install.sh
```

The installer backs up config files before editing them. If your client is not configured automatically, add this fallback manually:

```json
{
  "mcpServers": {
    "skills-discovery": {
      "command": "skills-discovery-mcp"
    }
  }
}
```

Re-run `scripts/install.sh` to update an existing install. To uninstall:

```bash
curl -fsSL https://raw.githubusercontent.com/jaychempan/Agent-Leaderboard/main/scripts/uninstall.sh | bash
```

You can also run the server directly from a cloned checkout:

```bash
python3 -m mcp.skills_discovery.server
```

By default the server reads the daily remote catalog at `https://agentskills.media/data/discovery_index.json`, generated from the leaderboard data. To test a local or custom index, point it at an absolute file URL:

```bash
SKILLS_DISCOVERY_INDEX_URL=file:///absolute/path/to/data/discovery_index.json \
python3 -m mcp.skills_discovery.server
```

Example chat queries:

- Find Codex testing skills
- Recommend Claude UI/UX skills
- Top MCP browser automation servers

The server returns guidance, matching repositories, and links only. It does not execute install commands or modify your environment.

## Run locally

The checkout includes data, so you can preview the website without fetching GitHub or installing frontend dependencies. Python 3.12 is recommended and is used by the daily workflow.

```bash
git clone https://github.com/jaychempan/Agent-Leaderboard.git
cd Agent-Leaderboard
python3 scripts/serve.py --port 8080
```

Open **http://127.0.0.1:8080**. The website is plain HTML, CSS and JavaScript with no frontend build step.


Visit statistics use the public [soxft/busuanzi API](https://github.com/soxft/busuanzi/wiki/api) at `https://busuanzi.9420.ltd/api`, compatible with static GitHub Pages. The homepage displays **daily page views (PV)** and **total visitors (UV)**. Both `https://agentskills.media` and `https://jaychempan.github.io/Agent-Leaderboard/` use the canonical `agentskills.media` namespace. Each document sends one POST; board, filter and language changes do not recount. A virtual `/__visits/YYYY-MM-DD` path groups loads by Asia/Shanghai date, derived from the browser clock. Its `page_pv` is the daily count; `site_uv` is the service’s cumulative deduplicated visitor count, not the sum of daily UV. Reload to update the snapshot. A new date selects a new daily bucket without subtracting cumulative PV. Correct device time is required.

UV estimates visitors using IP, User-Agent and a signed anonymous identity stored as `st_visit_identity_v1` in localStorage; it does not identify real people. Clearing storage or changing devices can affect deduplication. Requests send only the canonical domain, statistics date and anonymous identity, without searches, query strings, referring-page URLs or third-party cookies. The public service has no SLA or data-integrity guarantee; for controlled retention, self-host the same open-source service and change `VISIT_API`. The former `busuanzi.cc` endpoint timed out (524) during verification and has been removed. Its history is not migrated: counts start with the new integration, without estimated offsets. Failures show an unavailable state; missing individual metrics show `—`, never fake zero. Ambiguous POST failures are not automatically retried.

Run `python3 scripts/serve.py` for isolated local daily PV and anonymous browser UV through `/api/visits`, persisted in `.local/visits.sqlite3`. Existing local PV history is retained; local UV starts with this feature. Plain `python3 -m http.server` does not provide the API. Check with `node --test tests/visit-counter.test.cjs` and `python3 -m unittest discover -s tests -p 'test_preview_server.py'`. Browser integration checks are in `tests/visit-counter-browser.cjs` (mocked by default; `--live` uses the real service). The deploy workflow checks for conflicting or duplicate homepage scripts before publishing.

### Refresh data

Run from the repository root. Fetchers use the Python standard library. A GitHub token is optional locally; the scripts accept `GITHUB_TOKEN` / `GH_TOKEN` from the environment or a `--token` argument.

```bash
python3 scripts/fetch_data.py
python3 scripts/fetch_mcp.py
python3 scripts/fetch_prompts.py
python3 scripts/fetch_frameworks.py
python3 scripts/fetch_auto_research.py
python3 scripts/build_discovery_index.py
python3 scripts/build_trends.py
```

The discovery builder produces the catalog consumed by MCP and the extension. The trend builder records daily snapshots, retains up to 40 days and writes compact browser data. For a one-time recovery from available Git history, use `python3 scripts/build_trends.py --from-git`; this needs the relevant historical commits. Missing baseline dates remain unavailable rather than being replaced by shorter periods.

### Validate changes

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/chrome/*.test.mjs
```

For trend interaction and responsive layout checks, install `playwright-core`, keep the local server running, and supply your Chrome executable:

```bash
SITE_BASE_URL=http://127.0.0.1:8080/ \
CHROME_PATH=/absolute/path/to/chrome \
node tests/trends-browser.cjs
```

If needed, set `PLAYWRIGHT_MODULE` to an absolute path to the `playwright-core` module. Browser screenshots are written to the ignored `artifacts/trends/` directory.

## Automated updates and deployment

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| [Daily Data Update](.github/workflows/daily-update.yml) | Daily at 02:00 UTC / 10:00 China time; manual dispatch | Refreshes all five boards, rebuilds discovery and trend data, and commits changed outputs |
| [Deploy to GitHub Pages](.github/workflows/deploy.yml) | Push to `main`, completion of the daily workflow, or manual dispatch | Builds the extension download and deploys the static site |

The daily workflow passes the built-in `github.token` as `GH_TOKEN` and requests `contents: write`; a separately configured `GH_TOKEN` secret is not required by the current workflow. For a fork, enable Actions and select **GitHub Actions** as the Pages source. Use **Actions → Daily Data Update → Run workflow** for a manual data refresh.

## Data coverage

All five collectors currently use a **50-star threshold**. Repository names, descriptions and topics drive discovery and classification; relevance rules and exclusions vary by board. Categories and platform labels are discovery aids, not guarantees of compatibility or quality. The data comes from GitHub search and incremental merges, so it is not an exhaustive directory or a guarantee that every repository is refreshed on each run.

## Repository structure

```text
Agent-Leaderboard/
├── index.html                   # Five boards and the trending overlay
├── src/
│   ├── shared.js / shared.css   # Routing, filters, themes and shared UI
│   └── trends.js / trends.css   # Trending rankings and panel interaction
├── data/
│   ├── *.json / *.js            # Board datasets and discovery index
│   ├── star_history.json       # Daily snapshots; not loaded by the browser
│   └── trends.json / trends.js  # Compact 1 / 7 / 30-day star changes
├── scripts/
│   ├── fetch_*.py               # GitHub collection and shared helpers
│   ├── build_discovery_index.py # Catalog for MCP and the extension
│   ├── build_trends.py          # Daily history and trend generation
│   ├── install.sh / uninstall.sh
│   └── chrome/                 # Extension packaging and assets
├── mcp/skills_discovery/        # Local MCP discovery server
├── chrome/                     # Loadable Chrome extension
├── extension/                  # Extension showcase and guides
├── trending/index.html         # Legacy URL redirect to the overlay
├── docs/                       # Usage and data documentation
├── tests/                      # Python, extension and browser checks
└── .github/workflows/          # Daily data refresh and Pages deployment
```

## Contributing

Improvements to discovery queries, classification, documentation and the UI are welcome. Keep the English and Chinese READMEs aligned, and run the checks relevant to your change.

Licensed under [MIT](LICENSE).
