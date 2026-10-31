# GitHub 登录与网站云收藏部署

更新日期：2026-10-31。

网站继续由 GitHub Pages 托管，DNS 保留在腾讯云。登录与收藏使用独立 `workers.dev` 地址的 Cloudflare Worker 和 D1 数据库，不需要迁移域名或更改现有 DNS。这个结构参考了 [CCFDDL 的公开实现](https://github.com/ccfddl/ccf-deadlines/tree/main/worker)，并适配独立 API 地址。

GitHub 只确认登录身份，站内收藏不会自动给 GitHub 仓库点 Star。Chrome 插件仍使用自己的本地收藏，不接入网站账号。

**代码和模拟测试通过不代表真实登录已开通。** 正式启用需要自有 GitHub OAuth App、Worker secrets、D1 迁移和部署，最后验证真实登录及跨设备恢复。API 未部署或认证未配置时，网站仍可使用本地收藏。

## 1. 确认 Worker 地址并迁移 D1

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create agent-leaderboard
```

已有数据库时直接复用，不要重复创建。将账号 ID、数据库 ID 填入 `worker/wrangler.jsonc`，保留 `workers_dev: true` 和空 `routes`。在 Cloudflare Workers 控制台或 Wrangler 部署结果中确认实际地址，本项目为 `https://agent-leaderboard-api.jaychempan.workers.dev`。以下用 `API_ORIGIN` 表示这个完整来源，不含 `/api`。

配置 Worker 公开变量：

```json
{
  "PUBLIC_ORIGIN": "https://agentskills.media",
  "API_ORIGIN": "https://agent-leaderboard-api.jaychempan.workers.dev"
}
```

然后执行：

```bash
npm run db:migrate:remote
```

按顺序应用 `worker/migrations/` 中的所有迁移。已经应用的 `0001_initial.sql` 不应修改；独立地址登录的短期交换记录由后续迁移增加。先确认当前账号和数据库是目标资源。

D1 保存 GitHub 用户标识、用户名和公开头像资料、本站会话令牌的哈希、短期登录校验与一次性交换记录、本地导入去重标识，以及按用户隔离的仓库收藏与显示快照。客户端不能指定其他账号来读写收藏。参见 [D1 创建与绑定](https://developers.cloudflare.com/d1/get-started/) 和 [workers.dev 地址](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)。

## 2. 创建 GitHub OAuth App

在 GitHub [New OAuth App](https://github.com/settings/applications/new) 注册：

- Application name：`Agent Leaderboard`
- Homepage URL：`https://agentskills.media/`
- Authorization callback URL：`https://agent-leaderboard-api.jaychempan.workers.dev/api/auth/github/callback`。

普通登录不申请 `repo`、`public_repo` 或 `gist` 权限。Worker 用授权码读取 GitHub 用户身份后丢弃 GitHub access token，GitHub 令牌不会发送到官网前端。参见 [GitHub OAuth App 创建说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)。

## 3. 配置 secrets 与前端

取得 Client ID 和 Client Secret，通过 Worker secrets 保存：

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

也可在 Cloudflare 控制台对应 Worker 的 **Settings → Variables and Secrets** 添加加密 secret。`SESSION_SECRET` 使用密码学安全随机生成、至少 32 字节的独立值；已有值不必重复生成。不要把 Client Secret 或会话密钥放入前端、仓库、Issue、聊天记录或命令行参数。参见 [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

前端 `src/auth-config.js` 使用实际 API 地址：

```js
window.FAVORITES_CONFIG = {
  apiBase: 'https://agent-leaderboard-api.jaychempan.workers.dev/api'
};
```

Worker 只允许 `PUBLIC_ORIGIN` 精确匹配的网页来源。CORS 允许必要的方法和请求头，不发送跨站 Cookie。`github.io` 备用站点不在生产允许来源中；云收藏请使用 `https://agentskills.media/`。不要改成允许任意来源。

登录会先整页跳转到 API，再进入 GitHub。Worker 使用自己的 OAuth state、PKCE 和 API 域名下的短期 HttpOnly 校验 Cookie。登录完成后，浏览器收到绑定自身 PKCE 校验的一次性短期交换码；前端立即清理地址，再用校验值换取本站会话。**GitHub 令牌和本站会话令牌不会放进网址。**

本站会话令牌只保存在当前标签页的 `sessionStorage`，最长八小时，用于 `Authorization: Bearer` API 请求；刷新页面可以恢复会话，关闭标签页或到期后可能需要重新登录。浏览器不在 `localStorage` 保存登录令牌。收藏本身长期保存在 D1，不随标签页关闭或会话到期丢失。

本地测试可用未提交的 `.dev.vars`，并将 `PUBLIC_ORIGIN`、`API_ORIGIN` 和 GitHub App 回调改为实际测试地址；本地允许 localhost HTTP，生产使用 HTTPS。建议测试与生产使用不同 OAuth App。

## 4. 测试并部署

在 `worker/` 中运行：

```bash
npm run check
npm run db:migrate:remote
npm run deploy
```

更多说明见 [Worker README](../worker/README.md)。部署后检查 `API_ORIGIN/api/health`，确认 `ok: true`、`authConfigured: true`，并验证 D1 读写。`authConfigured: false` 的健康响应不能证明数据库或 OAuth 已就绪。API 就绪后再发布静态前端。

网站单元测试与浏览器交互测试：

```bash
node --test tests/favorites.test.cjs tests/visit-counter.test.cjs
node tests/favorites-browser.cjs
```

浏览器测试需要 Chrome 与 Playwright；可用 `SITE_BASE_URL` 指向本地预览，用 `PLAYWRIGHT_MODULE` 指定已安装模块。测试使用独立 HTTPS API 来源的拦截 fixture，覆盖浏览器登录交换、会话存储和收藏契约；它不代替生产 GitHub OAuth、Cloudflare 网络可达性或真实 D1 的验收。

真实上线验收应包含 GitHub 登录和取消授权、刷新后会话恢复、首次合并已有本地收藏、另一设备登录恢复、添加与取消收藏、请求失败回滚、退出后云端仍保留，以及两个账号之间不能读写对方收藏。也需在实际使用地区确认 `workers.dev` API 可以访问。没有通过真实登录检查前，不应将云收藏标为已上线。

## 5. 收藏行为与删除

- 未登录时，收藏保存在当前来源的浏览器存储。旧 `st_favorites` 会迁移并保留备份；仓库资料暂缺时仍保留其 ID。
- 首次登录将此浏览器已有的本地收藏合并到账号。导入只插入缺失记录，避免覆盖账号已有资料；失败时保留本地记录供重试，不把其他账号缓存当作导入来源。
- 登录后添加和取消收藏通过在线 API 保存。失败会恢复界面并提示重试，不承诺后台排队上传离线修改。
- 换设备登录同一 GitHub 账号可恢复已成功保存的收藏；保存的公开仓库快照可展示已离开榜单的仓库。
- 取消收藏会删除 D1 中该账号对应的记录。退出仅撤销当前会话并清除当前标签页的会话，不删除云收藏。账号收藏仅保留在页面内存与 D1，重新打开需要联网读取；`localStorage` 只保留匿名收藏、旧数据备份和首次导入记录。
- 需要永久删除站内账号和全部云数据时，联系维护者。撤销 GitHub 应用授权不等于删除站点数据；不要把密码、令牌或收藏明细发到公开 Issue。

Cloudflare 与 GitHub 会处理登录和请求所需的连接信息。基础设施与备份的保留取决于服务及项目设置；参见 [Cloudflare 隐私政策](https://www.cloudflare.com/privacypolicy/) 与 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)。
