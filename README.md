# GitHub Skills Tracker

一个追踪 GitHub 上热门 AI Skills 与 Auto Research 仓库的排行榜网站。

![logo](favicon.svg)

## 功能

| 功能 | 说明 |
|------|------|
| 🌐 **两大榜单** | Skills 排行榜 + Auto Research 排行榜 |
| 🔍 **多维筛选** | 关键词搜索、语言、Stars 档位（全部/500+/1k+/5k+/10k+）、时间范围 |
| 🏷️ **用途多选** | 点击用途标签快速过滤，支持多选 OR 逻辑 |
| ⊞ **双视图** | 网格视图 / 列表视图自由切换，支持每页 24/48/96 条 |
| ❤️ **收藏夹** | 收藏感兴趣的仓库，数据存本地（localStorage） |
| 🌐 **中/英切换** | 界面文字一键切换中文 / English |
| 🌙 **深色/浅色** | 深色模式（默认） / 浅色模式切换 |
| 📊 **用途分析** | 自动分析仓库 description/topics，归类用途标签 |
| 📄 **分页** | 自动分页，支持键盘友好的翻页控件 |

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url>
cd skills-tracker

# 2. 爬取数据（需要 Python 3.8+，无需额外依赖）
python3 fetch_data.py
python3 fetch_auto_research.py

# 可选：使用 GitHub Token 提高 API 限额（60 → 5000 次/小时）
python3 fetch_data.py --token ghp_xxxxxxxxxxxx
python3 fetch_auto_research.py --token ghp_xxxxxxxxxxxx

# 3. 启动本地服务器（推荐，避免 CORS 问题）
python3 -m http.server 8080
# 然后打开 http://localhost:8080

# 或者直接用浏览器打开 index.html（大多数浏览器支持）
open index.html
```

## 文件结构

```
skills-tracker/
├── index.html              # Skills 排行榜页面
├── auto-research.html      # Auto Research 排行榜页面
├── shared.css              # 共享样式（深/浅色主题）
├── shared.js               # 共享逻辑（i18n、筛选、渲染）
├── favicon.svg             # 网站图标
│
├── fetch_data.py           # 爬取 Skills 数据 → data.js
├── fetch_auto_research.py  # 爬取 Research 数据 → auto_research_data.js
│
├── data.json               # Skills 数据（人类可读，可手动编辑）
├── data.js                 # Skills 数据（浏览器加载，自动生成）
├── auto_research_data.json # Research 数据
└── auto_research_data.js   # Research 数据（浏览器加载）
```

## 数据更新（每周一次）

```bash
# 两条命令即可刷新所有数据
python3 fetch_data.py && python3 fetch_auto_research.py
```

> 无 Token 时每小时限 60 次 API 请求，已内置节流；带 Token 可扩展到 5000 次。

## 收录标准

| 维度 | Skills 榜 | Research 榜 |
|------|-----------|-------------|
| 最低星数 | ★100+ | ★100+ |
| 关键词 | claude / codex / cursor / copilot / skill | deep research / autonomous / literature / RAG 等 |
| 分类 | Claude / Codex / Cursor / Copilot / 其他 AI | 深度研究 / 网页研究 / 文献综述 / 数据分析 / 知识管理 |

## 用途标签说明

脚本通过正则匹配 `name + description + topics` 自动归类：

| 标签 | 匹配关键词 |
|------|-----------|
| AI 代理 | agent, agentic, autonomous |
| 工具集成 | mcp, tool call, plugin, extension |
| 工作流自动化 | workflow, automat, pipeline |
| 知识管理 | knowledge base, second brain, obsidian, rag |
| 代码生成 | code gen, generation, coding assistant |
| UI/UX 设计 | ui, ux, design, frontend, slides |
| 写作/内容 | writing, content, humanize, marketing |
| … | 共 20+ 标签 |

## 技术栈

- **纯 HTML + CSS + JS** —— 无框架，无构建工具
- **Python 3 标准库** —— 仅用 urllib，无需 pip install
- **GitHub REST Search API** —— 公开接口，可选 Token

## 贡献

欢迎提交 PR 改进搜索查询、用途标签规则或 UI！
