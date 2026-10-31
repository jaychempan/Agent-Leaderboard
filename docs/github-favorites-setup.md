# GitHub 登录与网站云收藏部署

更新日期：2026-10-31。

网站沿用 GitHub Pages，通过主站同源的 Cloudflare Worker `/api/*` 接入 GitHub 登录，把收藏存入 D1。只需一个 Worker、一个数据库和自己的 GitHub OAuth App，不需要安装插件，也不需要在前端放令牌或密钥。这个结构参考了 [CCFDDL 的公开实现](https://github.com/ccfddl/ccf-deadlines/tree/main/worker)。

GitHub 只确认登录身份，站内收藏不会自动给 GitHub 仓库点 Star。Chrome 插件仍使用自己的本地收藏，不接入网站账号。

**代码和模拟测试通过不代表云服务已开通。** 正式启用需要 Cloudflare 账号授权、D1 迁移、自有 GitHub OAuth App 和 Worker 部署；最后还要验证真实登录及跨设备恢复。未部署 API 或未配置认证时，网站继续使用本地收藏。

## 1. 创建 GitHub OAuth App

在 GitHub **Settings → Developer settings → OAuth Apps → New OAuth App** 注册：

- Application name：`Agent Leaderboard`
- Homepage URL：`https://agentskills.media/`
- Authorization callback URL：`https://agentskills.media/api/auth/github/callback`

取得 Client ID 和 Client Secret。普通登录不申请 `repo`、`public_repo` 或 `gist` 权限。Worker 用授权码读取 GitHub 用户身份后丢弃 GitHub access token，再签发本站自己的会话。

Client Secret 只应存入下面的 Worker secret；不要写入 `src/auth-config.js`、仓库、Issue 或聊天记录。参见 [GitHub OAuth 官方流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。

## 2. 创建 D1 并迁移

`agentskills.media` 的 DNS 需要由 Cloudflare 管理并开启代理，才能让同域 `/api/*` 交给 Worker，其余页面继续由 GitHub Pages 提供。

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create agent-leaderboard
```

把返回的数据库 ID 填入 `worker/wrangler.jsonc` 的 `DB` 绑定，然后执行：

```bash
npm run db:migrate:remote
```

迁移位于 `worker/migrations/0001_initial.sql`。先确认当前 Cloudflare 账号和数据库是目标资源；远程迁移会创建用户、会话和收藏表。

D1 保存 GitHub 用户标识、用户名和公开头像资料、站点会话令牌的哈希、短期登录校验记录、本地导入去重标识，以及按用户隔离的仓库收藏与显示快照。客户端不能指定另一个账号来读写收藏。参见 [D1 创建与绑定](https://developers.cloudflare.com/d1/get-started/) 和 [Worker 路由](https://developers.cloudflare.com/workers/configuration/routing/routes/)。

## 3. 配置 Worker secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` 使用密码学安全随机生成、至少 32 字节的独立值。通过交互式 secret 输入保存，勿把真实值放到命令行参数、日志或仓库。

确认 `worker/wrangler.jsonc` 中 `PUBLIC_ORIGIN` 为 `https://agentskills.media`，路由为 `agentskills.media/api/*`。本地测试可以使用未提交的 `.dev.vars`，并将 `PUBLIC_ORIGIN` 和 GitHub App 回调改成测试时实际使用的同源地址；生产与本地建议使用不同的 OAuth App。

浏览器只持有本站的 HttpOnly Cookie。生产会话 Cookie 使用 Secure 和 SameSite 限制；登录状态和 PKCE 校验由 Worker 完成。前端配置只保留 API 路径：

```js
window.FAVORITES_CONFIG = { apiBase: '/api' };
```

`github.io` 备用站点没有主域名的 Worker 路由，也不共享登录 Cookie。云收藏请使用 `https://agentskills.media/`；备用来源仍可使用本地收藏。不要通过放开任意来源 CORS 或将会话令牌写进 URL 来跨域复用登录。

## 4. 测试并部署

在 `worker/` 中运行测试、执行迁移并部署：

```bash
npm run check
npm run db:migrate:remote
npm run deploy
```

更多说明见 [Worker README](../worker/README.md)。部署后先检查：

```text
https://agentskills.media/api/health
```

确认它返回 `ok: true`，认证配置也已就绪，再发布静态前端。账号或数据库尚未配置时，健康检查与本地页面可运行，但不能据此声称真实登录已开通。

网站单元测试与浏览器交互测试：

```bash
node --test tests/favorites.test.cjs tests/visit-counter.test.cjs
node tests/favorites-browser.cjs
```

浏览器测试需要已有 Chrome 与 Playwright；可用 `SITE_BASE_URL` 指向本地预览，并用 `PLAYWRIGHT_MODULE` 指定现有 Playwright 模块。浏览器测试使用同源 HTTP fixture，验证页面与 API 契约，不代替生产 GitHub OAuth 或真实 D1 的验收。

真实上线验收要包含：GitHub 登录和取消授权、刷新后会话恢复、首次合并已有本地收藏、另一设备登录恢复、添加与取消收藏、请求失败后界面回滚、退出后云端仍保留，以及两个账号之间不能读写对方收藏。没有通过这些检查前，不应将云收藏标为已上线。

## 5. 收藏行为与删除

- 未登录时，收藏保存在当前来源的浏览器存储。旧 `st_favorites` 会迁移并保留备份；仓库资料暂缺时仍保留其 ID。
- 首次登录将此浏览器已有的本地收藏合并到账号。导入采用只插入缺失记录的方式，避免覆盖账号已有资料；失败时保留本地记录供重试，不把其他账号的缓存当作导入来源。
- 登录后添加和取消收藏通过在线 API 保存。请求失败会恢复界面并提示重试，不会显示已经保存，也不承诺在后台排队上传离线修改。
- 换设备登录同一 GitHub 账号，再读取收藏即可恢复已成功保存的列表。收藏时保存的公开仓库快照可用于展示已离开榜单的仓库。
- 登录后取消收藏会删除 D1 中该账号对应的收藏记录。退出登录只撤销当前会话，不会删除云收藏。已登录收藏只保留在当前页面内存与 D1，重新打开需联网读取；浏览器持久化只保留匿名收藏、旧数据备份、首次导入记录及会话 Cookie。清除浏览器数据不会删除已成功保存的云收藏。
- 需要永久删除站内账号和全部云数据时，联系站点维护者处理。GitHub 应用授权可以在 GitHub 设置中撤销，但撤销授权不等于删除站点已保存的数据。不要把密码、令牌或收藏明细发到公开 Issue。

Cloudflare 与 GitHub 会处理登录和请求所需的连接信息。基础设施与备份的保留取决于服务及项目设置；参见 [Cloudflare 隐私政策](https://www.cloudflare.com/privacypolicy/) 与 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)。
