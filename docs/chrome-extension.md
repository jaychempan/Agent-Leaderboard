# Agent Leaderboard Chrome 搜索助手

把项目五大榜单放进 Chrome 侧边栏，浏览网页时即可搜索、筛选、收藏和查看仓库。使用 Manifest V3，要求 Chrome 116 或更高版本。

官网提供 [插件展示、安装指南与下载](https://agentskills.media/extension/)，页面源文件位于 `extension/`。

## 安装

v1.7.5 趋势与云收藏版可先[下载 ZIP](https://agentskills.media/dist/Chrome.zip)，按下方步骤加载。[Chrome 应用商店](https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf) 当前仍为 v1.6，商店更新需提交审核；商店旧版不包含本页的趋势和账号同步功能。

如需本地开发或手动加载，按以下步骤操作：

`chrome/` 已包含源码、图标和离线目录，可直接加载，无需先构建。

1. 打开 `chrome://extensions`，开启右上角的“开发者模式”。
2. 点击“加载已解压的扩展程序”。
3. 选择项目根目录下的 **`chrome/`** 文件夹。
4. 在 Chrome 工具栏的扩展程序菜单中固定本插件，点击图标打开搜索侧边栏。

本地安装也可直接复制整个 `chrome/` 文件夹，或运行 `python3 scripts/chrome/build.py`，将生成的 `dist/Chrome.zip` 解压后加载。需要云收藏时使用 v1.7.5 ZIP；商店版本号更新到 v1.7.5 后也可从商店安装。

## 目录结构

```text
chrome/                  # 仅插件运行文件，可直接加载
├── manifest.json
├── service-worker.mjs / background.js
├── favorites-sync.mjs / favorites-background.mjs
├── panel.html/js/css
├── core.mjs / trends.mjs / i18n.mjs / install-prompt.mjs / taxonomy.mjs
├── help.html / help-en.html
├── data/catalog.json / trends.json
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
- **收藏**：点击仓库右侧的书签按钮，再切换“收藏”查看。未登录时本地保存；在“收藏”页选择 GitHub 登录，可与官网同账号共享收藏。首次登录合并已有本地收藏，移出目录的仓库仍保留收藏快照。详见下方“GitHub 账号与云收藏”。
- **选中文字**：右键 → 在 Agent 排行榜搜索。若 Chrome 无法打开侧边栏，自动改用插件标签页。
- **地址栏**：输入 `agent` 后按 Tab 或空格，再输入关键词并回车。
- **快捷键**：`Ctrl+Shift+Y` / macOS `Command+Shift+Y` 打开插件；可在 `chrome://extensions/shortcuts` 调整。在插件内按 `/` 聚焦搜索，`Esc` 清空关键词。
- **独立标签页**：地址栏搜索或右键搜索回退可使用独立标签页，宽屏使用双列结果。底部网站链接跳转到当前榜单。
- **主题**：默认跟随系统明暗模式，并在系统切换时自动更新。点击搜索栏右侧的主题按钮，依次切换“跟随系统 → 浅色 → 深色”；手动模式不随系统变化，再次切回“跟随系统”即可恢复自动。选择会记住并同步到其他插件页面。

## 趋势榜（v1.7.5）

点击“趋势”，在五个来源之间切换，选择日榜 / 周榜 / 月榜，按增长率或新增 Stars 查看前 20 名。顶部搜索可缩小当前趋势列表；发现页的分类、用途和高级筛选不会影响趋势。仓库仍可收藏、查看详情和复制安装提示。

插件与官网使用同一份历史快照和排序规则：新增 Stars 为期末减期初，增长率为增量除以期初 Stars。概览中的净增包含下降项目；榜单只列正增长，期初为零的项目不参与增长率排序。显示实际观测起止日期，缺少历史时明确提示，不能将缺失数据当作零增长。这些数字反映站内观测变化，并非 GitHub 实时新增。

内置目录和趋势可以离线查看。更新时核对每个来源的采集时间，避免将不同日期的目录 Stars 和历史增量混算。JSON 更新只刷新数据；已手动安装旧版插件的用户仍需下载新包、覆盖原文件夹并在扩展管理页重新加载。

## 数据与隐私

构建会使用 `data/discovery_index.json` 生成完整精简快照，并打包 `data/trends.json`。首次打开或距上次成功更新超过 24 小时时，从官网对应 JSON 地址更新目录和趋势；也可手动点击“更新数据”。趋势需要与每个来源的目录采集时间一致；离线、请求失败、格式无效、时间不匹配或远程目录更旧时保留已有可用快照。底部明确显示数据日期和状态。

目录过大或浏览器存储空间不足时，本次联网数据仍可使用，但不能缓存；界面会提示，下次使用此前缓存或内置快照。未登录收藏和偏好保存在插件本地；主动登录后，收藏通过与官网相同的 Cloudflare Worker 和 D1 按 GitHub 账号保存。卸载删除插件本地数据，不删除已成功保存的云收藏。

权限为 `storage`、`sidePanel`、`contextMenus`，以及官网和收藏 API 的现有来源权限。已登录官网页面与插件建立原生消息通道，仅传公开账号信息和一次性 PKCE 授权码；不读取官网 Cookie、浏览历史、网页正文或登录令牌。`externally_connectable` 仅允许官网主页与旧连接地址，后台校验来源、顶层页面、标签页和账号。没有 `identity` 或内容脚本权限，搜索词不上传。

## GitHub 账号与云收藏

本节适用于 v1.7.5。官网页面已有有效登录时，打开插件或进入“收藏”即可直接同步，不打开新页、不更改官网网址、不切换标签页，也不再点击确认连接。未登录官网时，点击“同步网页版收藏”直接打开官网的收藏弹窗，使用弹窗内的 GitHub 登录，完成后自动同步。旧连接页也会自动转到官网弹窗。升级前已经打开的旧官网页面需刷新一次以启用新通道；插件不会替你刷新或跳转。

- 首次登录将当前插件已有的本地收藏合并到当前账号。使用稳定的 GitHub 仓库 ID 和可重试的导入记录去重；切换账号不会把上一个账号的云收藏合并进新账号。
- 已退出榜单的仓库通过收藏快照保留。缺少 ID 的旧收藏会由 Worker 查询 GitHub 公开仓库元数据解析名称和 ID，不申请额外仓库权限。仓库已删除或无法解析时，仍留在本地并显示尚未导入的数量，不会假装已经上传。
- 登录后的添加和取消通过在线 API 保存。请求失败会恢复原状态并提示重试，不提供离线修改的后台排队上传。离线目录搜索仍可使用；账号列表仅有当前浏览器会话缓存，不提供长期离线账号镜像。
- “同步”重新读取已保存的云收藏。其他设备或官网的改动会在重新同步后显示，页面不会承诺每次改动都立即推送到所有设备。
- 插件在仅限可信扩展上下文的 `chrome.storage.local` 保存本站登录凭据，新登录固定有效 30 天；PKCE 校验资料和当前账号收藏缓存仍只在 `chrome.storage.session`，不保存持久账号收藏镜像。GitHub access token 由 Worker 读取身份后丢弃，不进入插件。本地导入去重记录可能包含原本地收藏快照、归属账号和分批导入/清理回执，退出后可能继续保留；它不是云端账号列表的持久镜像。
- 浏览器重启或扩展重载、升级后，可直接恢复有效的持久登录，无需先打开官网。会话在签发后 30 天到期，不随使用延长；旧版八小时会话保持原到期时间，届时登录一次即可使用新期限。手动退出插件会关闭自动连接偏好，重启或切回官网也不会立刻重新登录；再次点击“同步网页版收藏”才恢复自动连接。两端会话独立，退出一端不退出另一端，也不删除云收藏。卸载前请确认本地收藏已导入成功。

两端使用同一 Worker、D1 和 GitHub 应用，沿用现有 GitHub callback；发布新版 Worker 后，新会话固定有效 30 天。官网只向正式插件交接 90 秒一次性授权码，插件的 PKCE 校验资料不离开扩展。校验来源、真实端口和标签页、目标账号、状态及有效期后，插件才建立独立的最长 30 天会话。已有插件账号不会被另一个官网账号静默替换；多个官网登录账号且没有活动官网页时，提示先选中需要同步的官网页。

云端部署与删除说明见 [GitHub 登录与收藏部署](github-favorites-setup.md) 和 [隐私政策](https://agentskills.media/privacy/)。代码测试与模拟授权不代替真实 GitHub 登录及官网、插件双向恢复的验收。

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

Chrome API 依据：[Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)、[Omnibox](https://developer.chrome.com/docs/extensions/reference/api/omnibox)、[权限声明](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)、[官网消息连接](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#external-webpage) 与 [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)。

官网通过 `.github/workflows/deploy.yml` 在部署前运行构建脚本，发布最新 ZIP 到 `dist/Chrome.zip`。展示页复用插件的安装提示生成逻辑；更新界面后，可用相同的浏览器环境运行 `node scripts/chrome/capture_showcase.cjs` 重新生成 `extension/assets/` 中英文、明暗截图。官网测试入口为 `node tests/extension-showcase.cjs`（默认本地端口 8765，或设置 `SITE_BASE_URL`）。
