# GitHub 登录与网站云收藏部署

更新日期：2026-10-31。

网站通过 Supabase Auth 使用 GitHub 登录，收藏保存在 Supabase Postgres，并按用户隔离。GitHub 仅提供身份认证，不会因为站内收藏而自动 Star 仓库。Chrome 插件的收藏仍保存在当前 Chrome 配置中，与网站收藏独立。

**提交代码不等于开通服务。** 维护者必须创建 Supabase 项目、配置 GitHub OAuth App、执行数据库迁移并填入公开前端配置，才能启用真实登录与同步。仓库不包含生产项目凭据；未配置时继续使用本地收藏。

## 1. 创建 Supabase 项目和收藏表

在自己的 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目，记录项目 URL 与 **publishable key**。在 SQL Editor 执行 [收藏表迁移](../supabase/migrations/202610310001_favorites.sql)。也可以用 Supabase CLI 关联项目并执行迁移：

```bash
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

若本地已经初始化过 Supabase，跳过 `supabase init`。先确认关联的是目标项目；`db push` 会更改该项目的数据库结构。

迁移创建 `public.favorites`，主键为 `(user_id, repo_id)`；公开仓库快照必须为 JSON 对象，序列化后最多 32768 字节。数据库启用 Row Level Security（RLS），只允许登录用户读写自己的行，匿名角色没有收藏表权限。`updated_at` 由服务器触发器设置，客户端提交的时间会被覆盖。

## 2. 配置 GitHub OAuth App

1. 打开 GitHub 的 **Settings → Developer settings → OAuth Apps → New OAuth App**。
2. Homepage URL 填 `https://agentskills.media/`。
3. 从 Supabase **Authentication → Sign In / Providers → GitHub** 复制回调 URL，通常是 `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`，填入 GitHub 的 **Authorization callback URL**。
4. 注册后取得 **Client ID** 并生成 **Client Secret**，只把它们填入 Supabase 的 GitHub Provider 配置，启用并保存。
5. 不需要开启 GitHub Device Flow，也不需要申请 `repo`、`public_repo` 或 `gist` 权限。使用 Supabase Provider 所需的身份权限即可。

GitHub OAuth App 的回调是 **Supabase 的 `/auth/v1/callback`**，不是网站首页。Supabase 负责机密凭据和 GitHub 授权码兑换；网站不会接收 GitHub Client Secret。详见 [Supabase GitHub 登录](https://supabase.com/docs/guides/auth/social-sign-in/auth-github) 和 [GitHub OAuth 流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。

## 3. 设置网站回跳地址

在 Supabase **Authentication → URL Configuration** 中将 **Site URL** 设为 `https://agentskills.media/`，并把以下实际使用的地址加入 **Redirect URLs**：

```text
https://agentskills.media/
https://agentskills.media/index.html
https://jaychempan.github.io/Agent-Leaderboard/
https://jaychempan.github.io/Agent-Leaderboard/index.html
http://127.0.0.1:8080/
http://127.0.0.1:8080/index.html
http://localhost:8080/
http://localhost:8080/index.html
```

本地端口不同就添加对应的精确地址。目录入口和 `index.html` 入口都要配置，避免回跳到默认站点后因浏览器来源不同而无法完成 PKCE。业务 hash（例如 `#mcp`）无需逐项添加。生产环境使用精确 HTTPS 地址，避免为任意站点放开回跳。自定义域名与 `github.io` 是不同的浏览器存储来源，需要在各自来源登录；登录同一个 GitHub 账号后读取的是同一份云端收藏。

## 4. 填入公开的前端配置

编辑 `src/auth-config.js`：

```js
window.FAVORITES_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY'
};
```

这份文件会被 GitHub Pages 公开发布。只允许放 **publishable key**；旧项目也可使用启用 RLS 的 legacy **anon key**。**不能放 Supabase secret key、`service_role` key、数据库密码、GitHub Client Secret 或个人访问令牌。** Secret/service-role key 会绕过 RLS，不能出现在浏览器、仓库、Issue 或聊天记录中。[Supabase RLS 与管理员密钥说明](https://supabase.com/docs/guides/database/postgres/row-level-security)

登录采用浏览器 PKCE 会话，授权回跳必须在发起登录的同一浏览器中完成。会话凭据、用户专属离线缓存及待同步操作保存在该来源的浏览器存储中；共享电脑使用后应退出并按需要清除网站数据。[Supabase PKCE 说明](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

## 5. 同步与迁移行为

- 未登录时可继续本地收藏。首次登录时迁移此前的本地收藏，并与该账号的云端收藏合并；不会用空云端列表覆盖已有收藏。
- 登录后的收藏与取消收藏先更新本地缓存，再同步到当前账号。断网或同步失败时保留待同步操作，恢复连接后重试；看到同步成功状态后再清理浏览器数据。
- 缓存与待同步操作按账号隔离。切换 GitHub 账号不能把上一个账号的收藏、离线更改或待同步队列当成新账号的数据。
- 取消收藏写入 `deleted = true` 的删除标记，其他设备读取标记后移除收藏。删除标记保留仓库标识与更新时间，避免旧设备把已取消的收藏恢复；它不会出现在正常收藏列表中。
- 退出登录保留云端收藏。清除网站数据只删除本机缓存、会话和尚未上传的更改，不会删除 Supabase 中的记录；再次登录可恢复已经成功同步的收藏。
- 删除账号或永久清除云端收藏需要由该 Supabase 项目的维护者处理。删除 `auth.users` 中的账号会级联删除其收藏行；备份和基础设施日志的保留取决于项目及服务设置。
- 插件没有接入这套网站登录，也不会把插件收藏上传到 Supabase。

## 6. 验证后再上线

本地数据库验证需要安装 Supabase CLI 和 Docker，并运行 Supabase 本地服务：

```bash
supabase init
supabase start
supabase db reset
supabase test db
```

已初始化时跳过 `init`。`db reset` 会重建本地数据库并重放迁移，不要对需要保留数据的本地环境执行。测试位于 [supabase/tests/favorites_rls.sql](../supabase/tests/favorites_rls.sql)，使用 pgTAP 验证两个用户的读写隔离、匿名角色拒绝、快照限制、服务器时间戳和删除标记读取。

浏览器验收应覆盖：首次 GitHub 登录与取消授权、刷新后恢复会话、已有本地收藏合并、另一设备恢复、取消收藏跨设备生效、断网后重试、退出和切换账号、授权回跳失败，以及禁用云配置后的本地收藏。还要用两个真实账号确认一个账号无法读取或写入另一个账号的数据。

当前仓库中的迁移和测试文件本身不能证明生产项目已应用 RLS。只有目标项目迁移成功、数据库隔离测试通过并完成真实 GitHub 登录/跨设备验收，才算上线完成。GitHub Pages 继续负责静态网站；身份会话和云收藏由所配置的 Supabase 项目处理，其基础设施数据处理适用 [Supabase Privacy Policy](https://supabase.com/privacy)。
