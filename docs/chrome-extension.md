# Agent Leaderboard Chrome 搜索助手

把项目五大榜单放进 Chrome 侧边栏，浏览网页时即可搜索、筛选、收藏和查看仓库。使用 Manifest V3，要求 Chrome 116 或更高版本。

官网提供 [插件展示、安装指南与下载](https://agentskills.media/extension/)，页面源文件位于 `extension/`。

## 安装

`chrome/` 已包含源码、图标和离线目录，可直接加载，无需先构建。

1. 打开 `chrome://extensions`，开启右上角的“开发者模式”。
2. 点击“加载已解压的扩展程序”。
3. 选择项目根目录下的 **`chrome/`** 文件夹。
4. 在 Chrome 工具栏的扩展程序菜单中固定本插件，点击图标打开搜索侧边栏。

发给同事时可以直接复制整个 `chrome/` 文件夹，也可运行 `python3 scripts/chrome/build.py`，将生成的 `dist/Chrome.zip` 发给同事，解压后加载。此版本为本地安装包，尚未发布到 Chrome 应用商店。

## 目录结构

```text
chrome/                  # 仅插件运行文件，可直接加载
├── manifest.json
├── background.js
├── panel.html/js/css
├── core.mjs / i18n.mjs / install-prompt.mjs / taxonomy.mjs
├── help.html / help-en.html
├── data/catalog.json
├── icons/               # Chrome 使用的 PNG 图标
└── LICENSE
scripts/chrome/          # 构建、图标导出、官网截图脚本
tests/chrome/            # 插件测试
docs/chrome-extension.md # 本说明
extension/assets/       # 官网展示图与原始 SVG 标志
dist/Chrome.zip         # 只包含插件运行文件的发布包（不提交 Git）
artifacts/extension/    # 本地测试截图和检查结果（不提交 Git）
```

## 使用

- **中英文切换**：点击搜索栏右上角的 EN / 中，即时切换界面、分类、用途、详情、分页和状态提示；语言选择会记住并同步到其他插件页面，保留当前搜索、筛选及页码。仓库名称和简介保留原文。右键菜单、地址栏提示及工具栏提示也跟随语言选择，使用说明提供中英文两版。

- **仓库分页**：每页 30 条，底部固定显示“上一页 / 页码 / 下一页”，可输入页码按回车跳转。翻页后回到列表顶部；切换搜索、筛选或排序时回到第一页。首末页禁用对应按钮，无结果时隐藏分页。
- **紧凑侧边栏**：侧边栏使用 Chrome 自带的标题，内部直接显示搜索栏，主题和语言按钮位于搜索栏右侧。搜索和筛选集中在顶部，仓库列表独立滚动，底部始终显示数据状态。每行用不同底色的图标和 Skills / MCP / Prompt / 框架 / 研究文字标识区分工具类型，突出仓库名称；Stars 和书签收藏放在右侧，作者、语言、榜单和 README 位于次要信息行。简介默认一行，完整介绍在“详情”内展开。顶部榜单采用六个等宽的图标与文字入口，全部直接显示，不需要横向滚动或左右箭头。分类和用途并排显示，用途按需展开。搜索名称、描述、用途、标签；多个空格分隔的关键词需同时匹配。不同榜单的同一仓库合并展示。
- **分类**：与网站使用相同的榜单名称和二级分类。例如 Skills 的 Claude / Codex / Cursor，MCP 的数据库 / 网页工具 / 开发工具，框架的流程编排 / 多智能体。分类名称由构建脚本从网站导航和数据生成。
- **用途**：点击“全部用途”展开双列选项，可搜索用途、查看数量、清空已选，按 `Esc` 收起。收起时显示所选用途或已选数量。支持多选，按网站当前逻辑同时匹配所有已选用途；点击结果中的分类或用途也能筛选。切换榜单会清除原榜单的分类和用途选择。
- **筛选**：适用平台、编程语言、最低 Stars，以及全部时间 / 近 1 月 / 近 3 月 / 近 1 年；按相关度、Stars、最近更新排序。已选条件可逐项移除或清除。平台依据目录关键词推断，不保证兼容性；时间筛选和最近更新采用 GitHub `updated_at`。
- **查看**：点击名称打开仓库；长名称和简介会省略，悬停名称可查看完整仓库名，展开“详情”查看完整简介、用途和标签，也可复制链接。
- **复制安装提示**：点击每个仓库右侧、书签旁的复制图标，或展开“详情”点击“复制安装提示”，再粘贴到 Claude Code、Codex、Cursor 等 AI 编程工具。提示包含仓库地址和 README，并让 AI 识别当前环境、按官方文档安装或接入、保留已有配置并验证结果；资源合集会先确认具体组件。提示语言跟随界面，不自动安装或发送给其他应用。
- **收藏**：点击仓库右侧的书签按钮，再切换“收藏”查看；收藏保存在当前 Chrome 配置中，移出目录的仓库仍保留收藏快照。
- **选中文字**：右键 → 在 Agent 排行榜搜索。若 Chrome 无法打开侧边栏，自动改用插件标签页。
- **地址栏**：输入 `agent` 后按 Tab 或空格，再输入关键词并回车。
- **快捷键**：`Ctrl+Shift+Y` / macOS `Command+Shift+Y` 打开插件；可在 `chrome://extensions/shortcuts` 调整。在插件内按 `/` 聚焦搜索，`Esc` 清空关键词。
- **独立标签页**：地址栏搜索或右键搜索回退可使用独立标签页，宽屏使用双列结果。底部网站链接跳转到当前榜单。
- **主题**：默认跟随系统明暗模式，并在系统切换时自动更新。点击搜索栏右侧的主题按钮，依次切换“跟随系统 → 浅色 → 深色”；手动模式不随系统变化，再次切回“跟随系统”即可恢复自动。选择会记住并同步到其他插件页面。

## 数据与隐私

构建会使用 `data/discovery_index.json` 生成完整精简快照。首次打开或距上次成功更新超过 24 小时时，从 `https://agentskills.media/data/discovery_index.json` 更新；也可手动点击“更新数据”。离线、请求失败、目录格式无效或远程目录更旧时保留已有数据。底部明确显示数据日期和状态。

目录过大或浏览器存储空间不足时，本次联网数据仍可使用，但不能缓存；界面会提示，下次使用此前缓存或内置快照。收藏和网站的 localStorage 收藏夹独立，暂不支持跨设备同步。卸载会删除插件本地数据。

权限仅为 `storage`、`sidePanel`、`contextMenus` 和目录站点 `https://agentskills.media/*`。不使用内容脚本，不读取历史、Cookie 或网页正文。搜索在本地进行；右键选中文字仅传入插件，不发送至服务端。插件无统计追踪和远程执行代码。

## 开发与验证

```bash
python3 scripts/chrome/build.py
node --test tests/chrome/*.test.mjs
python3 -m unittest discover -s tests
```

实际 Chrome 加载、搜索、收藏、断网/更新回退与布局验证（需要 `playwright-core` 和 Chrome）：

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
CHROME_PATH=/absolute/path/to/chrome \
node tests/chrome/browser.cjs
```

测试使用全新临时 Chrome 配置，直接以 DevTools `Extensions.loadUnpacked` 加载 `chrome/`；该测试入口需要支持此调试接口的新版 Chrome。联网响应由测试夹具控制，避免依赖线上更新内容。截图输出在 `artifacts/extension/`。右键与地址栏事件处理另有单元测试。

修改源码后在扩展管理页面点击“重新加载”即可。更新内置快照或生成 ZIP 时才需运行构建脚本；脚本读取项目的 `data/discovery_index.json`，更新 `chrome/data/catalog.json`，并打包现有图标。每日线上目录更新无需重新安装。运行所需文件均保存在 `chrome/`；`dist/` 的安装包和 `artifacts/` 的测试输出不提交到 Git。

图标复用项目根目录 `favicon.svg` 的领奖台、排名数字和星标，保留主体比例，通过收紧画布留白使主体较原始透明版放大约 14%，移除底板和背景光晕，使用透明背景，原始 SVG 位于 `extension/assets/logo.svg`。原图与 [官网 favicon](https://agentskills.media/favicon.svg) 一致。Chrome 侧边栏标题、工具栏和扩展管理页统一使用从该 SVG 导出的 `chrome/icons/icon-*.png` 透明图标；清单中同时指定扩展图标和工具栏图标。只有修改 Logo 时，才需要配置与浏览器测试相同的 `PLAYWRIGHT_MODULE` / `CHROME_PATH`，运行 `node scripts/chrome/render_icons.cjs` 重新导出，再打包。

Chrome API 依据：[Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[Omnibox](https://developer.chrome.com/docs/extensions/reference/api/omnibox)、[权限声明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)。

官网通过 `.github/workflows/deploy.yml` 在部署前运行构建脚本，发布最新 ZIP 到 `dist/Chrome.zip`。展示页复用插件的安装提示生成逻辑；更新界面后，可用相同的浏览器环境运行 `node scripts/chrome/capture_showcase.cjs` 重新生成 `extension/assets/` 中英文、明暗截图。官网测试入口为 `node tests/extension-showcase.cjs`（默认本地端口 8765，或设置 `SITE_BASE_URL`）。
