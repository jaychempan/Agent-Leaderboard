# MCP Skill Discovery Assistant Design

## Summary

Build a remote-data MCP server that lets users query the project's daily-updated agent ecosystem data from their AI chat clients. The first version focuses on search, recommendations, rankings, and install guidance for skills and related resources. It reuses the existing static data pipeline and does not require a hosted backend.

## Goals

- Let users install one MCP server and query the latest published catalog from Codex, Claude, Cursor, or other MCP-compatible clients.
- Convert the existing daily leaderboard data into a unified discovery index optimized for chat-driven retrieval.
- Support practical queries such as "find Codex testing skills", "top UI/UX skills", "what changed recently", and "how do I use this repo".
- Return structured results that an AI client can summarize into recommendations, rankings, and next actions.
- Keep the first release deployable as a lightweight local MCP process that fetches remote JSON and caches it.

## Non-Goals

- Do not build a website chat page in the first version.
- Do not build or operate a hosted search API.
- Do not execute installation commands on the user's machine from the MCP tool.
- Do not require embeddings or LLM preprocessing for every repository in the first version.
- Do not claim accurate star-growth rankings until historical snapshots exist.

## Architecture

The current fetch scripts and GitHub Actions continue to generate the five public data sets:

- Agent Skills
- MCP servers
- Prompt libraries
- AI frameworks
- Auto Research tools

A new index build step reads those JSON files and writes `data/discovery_index.json` plus `data/discovery_index.js`. The MCP server fetches the published `discovery_index.json` from the remote site or repository, stores a local cache, and serves tools from that cache.

The data flow is:

1. Existing daily fetch scripts update `data/*.json`.
2. `scripts/build_discovery_index.py` normalizes all records into one discovery catalog.
3. GitHub Actions publishes the updated index with the site.
4. Users run the MCP server locally.
5. The MCP server refreshes and caches the remote index.
6. AI clients call MCP tools to search, recommend, rank, and generate install guidance.

This keeps the data source centralized while avoiding a backend service.

## Unified Index

Each discovery index item contains:

- `id`
- `name`
- `full_name`
- `url`
- `description`
- `source_type`: `skill`, `mcp`, `prompt`, `framework`, or `research`
- `platforms`: normalized targets such as `claude`, `codex`, `cursor`, `copilot`, `gemini`, or `other`
- `categories`
- `use_cases`
- `topics`
- `language`
- `stars`
- `forks`
- `created_at`
- `updated_at`
- `rank_signals`: current rank and simple quality or freshness signals
- `search_text`: normalized searchable text built from name, description, topics, categories, and use cases
- `install`: inferred installation or usage metadata, with `manual_review` when the index cannot infer reliable instructions

The first version generates this from existing fields only. Future versions can add AI summaries, embeddings, richer install metadata, and historical star-growth signals without changing the basic consumer contract.

## MCP Tools

### `search_catalog`

Inputs:

- `query`
- `source_type`
- `platform`
- `use_case`
- `min_stars`
- `limit`

Returns matching catalog items with stars, source type, platforms, use cases, URL, and a short match reason.

### `recommend_for_task`

Inputs:

- `task`
- `platform`
- `limit`

Returns ranked recommendations with reasons, best-fit scenarios, and alternatives. Version one uses deterministic keyword and metadata scoring. The scoring can later be replaced or augmented with embeddings.

### `get_top_rankings`

Inputs:

- `source_type`
- `platform`
- `use_case`
- `sort`
- `limit`

Supported first-version sorts:

- `stars`
- `recently_updated`

`star_growth` is reserved until the project stores historical snapshots.

### `get_install_instructions`

Inputs:

- `repo_full_name`
- `client`

Returns client-specific setup guidance for Codex, Claude, Cursor, and generic MCP users when it can be inferred. If the repo does not expose a reliable install path, the tool returns manual review guidance and links rather than inventing commands.

### `get_catalog_status`

Inputs: none.

Returns catalog update time, record counts, source URL, and local cache status.

## Response Shape

Each tool returns structured data with:

- `answer_summary`: a concise text summary suitable for direct chat display
- `items`: structured result objects
- `meta`: counts, filters applied, cache status, and warnings

This lets clients show useful answers even when they only render text, while preserving structured results for richer clients.

## Ranking And Search

Version one uses local deterministic search:

- Tokenize and normalize user text.
- Score matches across `full_name`, `description`, `topics`, `categories`, `use_cases`, and `platforms`.
- Boost exact platform and use-case matches.
- Boost higher stars for ranking stability.
- Prefer recently updated projects when relevance scores are close.

This is enough for the first release and avoids adding an AI dependency to the MCP server.

## Install Guidance

The MCP server must not run install commands. It generates instructions and links only.

Guidance can include:

- GitHub repository URL.
- README link.
- Known client target when inferred from platforms.
- Copyable MCP or client configuration snippets only when the repo exposes enough information.
- A `manual_review` warning when automatic instructions are uncertain.

## Caching And Freshness

The server fetches the remote index on startup and caches it locally. If the remote fetch fails, it uses the last good cache and includes a warning in `get_catalog_status` and tool metadata.

The cache exposes:

- remote source URL
- last successful refresh time
- catalog `updated_at`
- item count
- stale or fetch-error warnings

## Testing

Add focused tests for:

- Index generation from representative source records.
- Platform and source type normalization.
- Search scoring and filtering.
- Ranking sorts.
- Empty result handling.
- Cache fallback behavior.
- MCP tool parameter validation and response shape.

## Release Documentation

Add documentation covering:

- What the MCP server does.
- How to configure it in common MCP clients.
- Which data source URL it reads.
- Example chat queries.
- What install guidance can and cannot automate.
- How daily updates reach installed users.

## First Implementation Scope

The first implementation includes:

- `scripts/build_discovery_index.py`
- generated `data/discovery_index.json`
- generated `data/discovery_index.js`
- an `mcp/` Python package containing the MCP server and shared search/index code
- tests for index generation, search, ranking, and tool responses
- GitHub Actions integration for generating the discovery index after daily data refreshes
- `.gitignore` coverage for `.superpowers/`

## Fixed First-Version Decisions

- The MCP server is implemented as a Python package to match the existing Python data pipeline and share normalization/search code with index generation.
- The default remote index URL is `https://agentskills.media/data/discovery_index.json`, with an environment variable override for development or mirrors.
- Historical snapshots and accurate star-growth ranking are deferred to a later version. Version one exposes current rankings and freshness metadata only.
