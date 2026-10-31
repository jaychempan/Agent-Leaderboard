# Agent 排行榜

<img src="favicon.svg" width="48" alt="Agent 排行榜 Logo" align="right" />

一站式发现 GitHub 上的 **Agent Skills**、**MCP 服务器**、**Prompt 库**、**AI 框架**和 **Auto Research** 工具。按累计 Stars 浏览热门项目，用趋势榜发现近期增长，也可以通过 Chrome 插件或 MCP 客户端搜索同一份目录。

[![Website](https://img.shields.io/badge/website-agentskills.media-blue?logo=googlechrome&logoColor=white)](https://agentskills.media)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-jaychempan.github.io-blue?logo=github&logoColor=white)](https://jaychempan.github.io/Agent-Leaderboard)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[English](README.md)** · **[浏览榜单](https://agentskills.media)** · **[安装 Chrome 插件](https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf)**

## 五大榜单

| 榜单 | 覆盖内容 |
|------|----------|
| [Agent Skills](https://agentskills.media/#skills) | Claude Code、Codex、Cursor、Copilot、Gemini、DeepSeek、OpenClaw、Hermes Agent 等工具的技能与相关项目 |
| [MCP 服务器](https://agentskills.media/#mcp) | 数据库、文件、网页、API 与开发工作流相关的 Model Context Protocol 服务器 |
| [Prompt 库](https://agentskills.media/#prompts) | 提示词合集、系统提示词与提示工程资源 |
| [AI 框架](https://agentskills.media/#frameworks) | Agent 编排、多智能体系统、记忆管理与模型路由 |
| [Auto Research](https://agentskills.media/#research) | 深度研究、文献检索、数据研究与知识工具 |

网站显示各榜单的收录数量、数据更新时间和排名。最新结果请以榜单页面为准，README 不再维护容易过期的手写 Top 10 快照。同一仓库可能属于多个榜单，各榜单数量相加不等于去重后的仓库总数。

## 趋势榜

点击顶部导航中高亮的 **「趋势榜」**，直接在主页展开浮窗；手机端入口位于导航菜单中。入口首次出现时轻轻晃动一次，系统开启「减少动态效果」时保持静态。

- **默认日榜，按增长率排序。** 可切换周榜、月榜，也可选择按 **新增 Stars** 排序。
- **每个板块展示前 20 名。** 五大板块使用统一交互，趋势榜内不按编码 Agent 再细分。
- **紧凑列表。** 显示项目对应的品牌与分类图标，前三名使用 🥇🥈🥉 奖牌；累计 Stars、增量和涨幅对齐展示。大数采用 `k` 缩写，悬停可看完整数值。
- **收起后继续查看。** 收起为右下角小按钮，再次展开保留板块、周期、排序和滚动位置。点击 ×、按 Esc 或点击浮窗外部可关闭，主页原有筛选与浏览位置保留。

趋势基于站内每日快照计算：**新增 Stars = 期末 − 期初**，**增长率 = 新增 Stars ÷ 期初 Stars × 100%**。日榜、周榜、月榜分别以各板块数据更新日期为基准，对比相隔 1、7、30 天的 UTC 日期。榜单只展示正增长项目；缺少历史的项目不参与比较，期初为零的项目不参与增长率排序。概览净增包含下降项目。

这些数字反映目录中观测到的变化，并非 GitHub 实时新增事件；增量采集可能保留部分旧记录。详见 [趋势数据与计算说明](docs/trending.md)。

## 网站功能

| 功能 | 说明 |
|------|------|
| 搜索与筛选 | 按仓库名称/描述、分类、编程语言、最低 Stars 和最近更新时间筛选 |
| 用途多选 | 同时满足所有已选用途标签 |
| 网格与列表 | 自由切换视图，每页显示 24、48 或 96 个仓库 |
| 收藏夹 | 浏览器本地保存；可通过 Cloudflare Worker 与 D1 接入 GitHub 登录和账号收藏 |
| 语言与主题 | 中文/English；默认跟随系统深浅色，手动切换后记住选择 |
| 品牌辨认 | 主页与趋势浮窗复用品牌和分类图标 |

### GitHub 登录与云收藏

网站通过一个使用独立 `workers.dev` 地址的 Cloudflare Worker 与 D1 数据库接入 GitHub 登录和账号收藏。首次登录合并已有本地收藏；登录后的添加和取消通过在线 API 保存。请求失败时恢复原状态并提示重试。退出登录或清除浏览器数据保留已成功保存的云端收藏，不会自动修改 GitHub Stars。Chrome 插件继续使用本地收藏，不接入网站登录。

没有 API 时仍可使用本地收藏。真实登录需要 Cloudflare 账号、自有 GitHub OAuth App、D1 迁移和 Worker 部署。DNS 可以保留在腾讯云，静态网页继续由 GitHub Pages 托管。GitHub 密钥仅存于 Worker；浏览器只在 `sessionStorage` 保存短期本站会话，GitHub 令牌和会话令牌不会放进网址。会话最长八小时，关闭标签页后重新打开可能需要再次登录。详见 [部署、隐私与验收步骤](docs/github-favorites-setup.md)。代码与模拟测试通过不等于生产服务已开通。

## Chrome 搜索插件

通过 **[Chrome 应用商店](https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf)** 安装，或查看 [中英文展示与使用指南](https://agentskills.media/extension/)。需要 Chrome 116 或更高版本。

在浏览器侧边栏搜索五大榜单，按分类、用途、平台、语言、Stars 和时间范围筛选，收藏项目、打开 README，并复制 AI 安装提示到编码助手。插件只生成提示，不会自动安装仓库。

支持选中文字右键搜索、地址栏 `agent` 搜索、`Ctrl+Shift+Y` / macOS `Command+Shift+Y` 快捷键，以及内置离线目录。插件收藏只保存在当前 Chrome 配置中，与网站收藏及其可选的云同步独立。

开发时可以打开 `chrome://extensions` → **开发者模式** → **加载已解压的扩展程序**，选择 **`chrome/`** 文件夹。更新内置目录并生成 `dist/Chrome.zip`：

```bash
python3 scripts/chrome/build.py
```

权限、更新策略、快捷键和开发验证见 [插件文档](docs/chrome-extension.md)。

## MCP 技能发现助手

在任何支持 MCP 的 AI 聊天工具里，都可以直接使用这个目录。这条 Bash 命令会安装服务、在 `~/.local/share/skills-discovery-mcp` 下创建独立 venv，并自动配置检测到的客户端：

```bash
curl -fsSL https://raw.githubusercontent.com/jaychempan/Agent-Leaderboard/main/scripts/install.sh \
  | SKILLS_DISCOVERY_CONFIGURE_CLIENTS=auto bash
```

安装命令适用于 macOS、Linux、WSL 或 Git Bash。原生 PowerShell 不支持这段 Bash 语法。

Codex 配好后，先确认 MCP 已注册，然后新开一个 Codex 会话：

```bash
codex mcp list
```

快速示例见 [`docs/mcp-quick-use.zh.md`](docs/mcp-quick-use.zh.md)。

如果要跳过客户端配置，或指定客户端：

```bash
SKILLS_DISCOVERY_CONFIGURE_CLIENTS=none bash scripts/install.sh
SKILLS_DISCOVERY_CONFIGURE_CLIENTS=codex,claude,cursor bash scripts/install.sh
```

安装器写入前会先备份配置文件。如果客户端没有被自动配置，可以使用这个手动兜底配置：

```json
{
  "mcpServers": {
    "skills-discovery": {
      "command": "skills-discovery-mcp"
    }
  }
}
```

重新运行 `scripts/install.sh` 可以更新已有安装。卸载：

```bash
curl -fsSL https://raw.githubusercontent.com/jaychempan/Agent-Leaderboard/main/scripts/uninstall.sh | bash
```

也可以在克隆后的仓库里直接启动本地发现服务器：

```bash
python3 -m mcp.skills_discovery.server
```

默认会读取每日生成的远程目录 `https://agentskills.media/data/discovery_index.json`。如果要测试本地或自定义索引，可以用绝对路径的 file URL 覆盖：

```bash
SKILLS_DISCOVERY_INDEX_URL=file:///absolute/path/to/data/discovery_index.json \
python3 -m mcp.skills_discovery.server
```

示例提问：

- 帮我找适合 Codex 的测试技能
- 推荐 Claude 可用的 UI/UX 技能
- 列出最热门的 MCP 浏览器自动化服务器

这个服务器只返回建议、匹配仓库和链接；不会执行安装命令，也不会修改你的环境。

## 本地运行

仓库已包含数据快照，无需先爬取 GitHub 或安装前端依赖即可预览。建议使用 Python 3.12，与每日更新工作流保持一致。

```bash
git clone https://github.com/jaychempan/Agent-Leaderboard.git
cd Agent-Leaderboard
python3 scripts/serve.py --port 8080
```

打开 **http://127.0.0.1:8080**。网站使用原生 HTML、CSS 和 JavaScript，无需前端构建。

访问统计使用 [soxft/busuanzi](https://github.com/soxft/busuanzi/wiki/api) 公共服务 `https://busuanzi.9420.ltd/api`，适用于纯静态 GitHub Pages，无需在 Pages 上运行后端。首页显示“今日访问量（PV）”与“累计访客人数（UV）”。在 `https://agentskills.media` 和 `https://jaychempan.github.io/Agent-Leaderboard/` 下启用，两者统一使用 `agentskills.media` 的统计命名空间。每个页面文档只发送一次 POST；切换榜单、筛选或语言不会重复计数。北京时间日期由浏览器时钟生成，作为虚拟统计路径 `/__visits/YYYY-MM-DD`；接口的 `page_pv` 即该日所有榜单的访问量，`site_uv` 是服务端去重的累计访客数，不是各天 UV 相加。刷新页面获取新快照，跨天使用新路径，不从累计 PV 相减推算日访问量。浏览器时钟应正确。

累计访客是服务商按 IP、User-Agent 和签名匿名标识估算的 UV，并非实名人数。签名标识保存在 `localStorage` 的 `st_visit_identity_v1`；清理存储、更换设备等会影响去重。请求仅发送规范域名、统计日期和匿名标识，不含搜索词、页面查询参数或来源页面，不发送第三方 Cookie。该公共服务无 SLA 或数据完整性承诺；若需长期数据保障，可自行部署同一开源服务并更改 `VISIT_API`。旧 `busuanzi.cc` 接口实测超时（524），已移除；各服务数据独立，旧历史无法自动迁移，当前数值从新服务接入开始累计，不添加估算基数。故障会显示不可用，缺失的单项显示 `—`，不显示假 0，也不自动重试可能已经计数的 POST。

本地运行 `python3 scripts/serve.py`，通过 `/api/visits` 提供隔离的日访问量和匿名浏览器去重人数，保存于 `.local/visits.sqlite3`，不影响线上统计。既有本地访问次数保留，访客数从启用新功能起累计；普通 `python3 -m http.server` 不提供统计接口。运行 `node --test tests/visit-counter.test.cjs` 和 `python3 -m unittest discover -s tests -p 'test_preview_server.py'` 验证逻辑；浏览器检查见 `tests/visit-counter-browser.cjs`（默认模拟接口，`--live` 验证真实服务）。部署工作流会先检查首页脚本没有重复加载或合并冲突。

### 更新数据

在仓库根目录运行。采集脚本只依赖 Python 标准库。本地可选用 GitHub Token，通过环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 或 `--token` 参数提供。

```bash
python3 scripts/fetch_data.py
python3 scripts/fetch_mcp.py
python3 scripts/fetch_prompts.py
python3 scripts/fetch_frameworks.py
python3 scripts/fetch_auto_research.py
python3 scripts/build_discovery_index.py
python3 scripts/build_trends.py
```

发现索引供 MCP 与插件使用。趋势构建器保存每日快照，保留最多 40 天历史，并生成浏览器使用的精简数据。若需从已有 Git 历史一次性恢复快照，可执行 `python3 scripts/build_trends.py --from-git`，需要本地具备对应历史提交。缺少基准日期时会显示数据不足，不以更短周期代替。

### 验证修改

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/chrome/*.test.mjs
```

验证趋势浮窗交互与响应式布局时，先安装 `playwright-core`，保持本地服务器运行，并指定 Chrome 可执行文件：

```bash
SITE_BASE_URL=http://127.0.0.1:8080/ \
CHROME_PATH=/absolute/path/to/chrome \
node tests/trends-browser.cjs
```

如需指定模块位置，设置 `PLAYWRIGHT_MODULE` 为 `playwright-core` 模块的绝对路径。截图输出到不提交 Git 的 `artifacts/trends/` 目录。

## 自动更新与部署

| 工作流 | 触发方式 | 内容 |
|--------|----------|------|
| [Daily Data Update](.github/workflows/daily-update.yml) | 每日 UTC 02:00 / 北京时间 10:00，或手动触发 | 更新五大榜单，构建发现索引与趋势数据，提交变化的产物 |
| [Deploy to GitHub Pages](.github/workflows/deploy.yml) | 推送到 `main`、每日更新工作流结束，或手动触发 | 构建插件下载包并部署静态站点 |

当前每日工作流使用内置 `github.token` 作为 `GH_TOKEN`，并申请 `contents: write` 权限，无需另建同名 Secret。Fork 后需启用 Actions，并将 Pages 的发布来源设为 **GitHub Actions**。手动刷新数据：**Actions → Daily Data Update → Run workflow**。

## 数据范围

五个采集器目前均采用 **50 Stars 门槛**。仓库名称、描述和 topics 用于发现与分类，各板块有各自的相关性规则和排除项。分类及平台标签用于辅助发现，不保证兼容性或项目质量。数据来自 GitHub 搜索与增量合并，并非完整目录，也不保证每次运行都会刷新每个仓库。

## 文件结构

```text
Agent-Leaderboard/
├── index.html                   # 五大榜单与趋势浮窗
├── src/
│   ├── shared.js / shared.css   # 路由、筛选、主题和共享界面
│   └── trends.js / trends.css   # 趋势排序和浮窗交互
├── data/
│   ├── *.json / *.js            # 各榜单数据与发现索引
│   ├── star_history.json       # 每日快照，不由浏览器加载
│   └── trends.json / trends.js  # 1 / 7 / 30 天精简增量数据
├── scripts/
│   ├── fetch_*.py               # GitHub 采集脚本与公共工具
│   ├── build_discovery_index.py # MCP 和插件使用的目录
│   ├── build_trends.py          # 历史快照与趋势生成
│   ├── install.sh / uninstall.sh
│   └── chrome/                 # 插件打包与素材
├── mcp/skills_discovery/        # 本地 MCP 发现服务
├── chrome/                     # 可直接加载的 Chrome 插件
├── extension/                  # 插件展示页与使用指南
├── trending/index.html         # 旧地址跳转到主页浮窗
├── docs/                       # 使用与数据说明
├── tests/                      # Python、插件与浏览器验证
└── .github/workflows/          # 每日数据更新和 Pages 部署
```

## 贡献

欢迎改进搜索查询、分类规则、文档和界面。修改说明时请同步中英文 README，并运行与改动相关的检查。

采用 [MIT 许可证](LICENSE)。
