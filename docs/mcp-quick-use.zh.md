# MCP 快速使用

这个 MCP 让 Codex、Claude Desktop、Cursor 这类客户端可以搜索 Agent Skills、MCP servers、Prompts 和 AI frameworks。

## 1. 安装

在 macOS、Linux、WSL 或 Git Bash 里运行：

```bash
curl -fsSL https://raw.githubusercontent.com/jaychempan/Agent-Leaderboard/main/scripts/install.sh \
  | SKILLS_DISCOVERY_CONFIGURE_CLIENTS=auto bash
```

原生 PowerShell 不支持这段 Bash 语法。Windows 用户建议用 WSL 或 Git Bash。

## 2. 确认 Codex 已识别

```bash
codex mcp list
```

看到 `skills-discovery` 且状态是 `enabled` 就可以了。安装后请新开一个 Codex 会话，当前已经打开的会话通常不会热加载新 MCP。

## 3. 在 Codex 聊天里使用

直接点名让 Codex 使用 `skills-discovery`：

```text
请使用 skills-discovery 搜索：Claude code writing skills
```

更明确一点：

```text
调用 skills-discovery 的 recommend_for_task，task 是“Claude Code writing skills”，platform 是 codex，limit=10
```

## 4. 用 Codex CLI 一次性查询

```bash
codex exec "请使用 skills-discovery 搜索 Claude code writing skills，只返回前 10 个结果"
```

也可以指定推荐任务：

```bash
codex exec "调用 skills-discovery 的 recommend_for_task，task='Claude Code writing skills', platform='codex', limit=10"
```

## 5. 直接测试 MCP 服务

这个命令绕过 Codex，直接确认 MCP 服务能返回结果：

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_catalog","arguments":{"query":"Claude code writing skills","limit":10}}}' \
| skills-discovery-mcp
```

## 常用工具名

- `search_catalog`：按关键词搜索
- `recommend_for_task`：按任务推荐
- `get_top_rankings`：查看热门排行
- `get_install_instructions`：查看某个仓库的安装提示
- `get_catalog_status`：查看目录状态
