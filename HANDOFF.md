# 项目交接记录

更新时间：2026-09-25
工作目录：`D:\NexusAI\2025-blog-public`

## 当前目标

恢复原 `2025-blog` 前端的完整页面和交互，同时保留当前自托管文档站；旧前端的编辑、上传和发布操作改为保存到本地 SQLite，不再依赖 GitHub App。

## 已完成

1. 恢复了原仓库中被删除的前端页面、组件、布局、配置、SVG、图片和博客资源。
   - 首页卡片、拖拽布局、背景气泡、音乐、点赞、站点配置弹窗均已回到原实现。
   - `/about`、`/blog`、`/blog/[id]`、`/bloggers`、`/clock`、`/image-toolbox`、`/live2d`、`/pictures`、`/projects`、`/share`、`/snippets`、`/svgs`、`/write`、`/wuthering-waves` 路由已恢复。
   - 原导航新增“API 文档”入口 `/docs`。

2. 新文档站继续保留。
   - `/docs`、`/docs/[id]`、`/sections/[id]`、`/search`、`/admin` 使用当前 SQLite 文档功能。
   - 文档页面使用独立的 `docs-site` 容器，旧站首页继续使用原玻璃卡片布局。

3. 旧 GitHub 文件操作已替换为本地存储适配。
   - `src/lib/github-client.ts` 保留旧服务函数名，内部将 blob/tree 写入 `/api/legacy`。
   - `src/lib/legacy-files.ts` 在 SQLite 的 `legacy_files` 表保存旧站 JSON、Markdown、博客图片和站点资源的覆盖层。
   - 原仓库文件仍作为 fallback；本地覆盖优先读取，删除操作会记录为 tombstone。
   - `/blogs/*`、`/images/*`、`/favicon.png` 通过 Next rewrite 读取 `/api/legacy`，所以旧页面不需要改路径。
   - 旧编辑页未登录时跳转 `/admin?next=当前路径`；登录后返回原页面继续保存。

4. 管理、上传和点赞已接入本地数据。
   - 管理员登录使用 `.env.local` 中的 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SESSION_SECRET`。
   - `/api/legacy` 负责旧文件读取、目录读取和管理员写入。
   - `/api/like` 替代旧外部点赞 Worker，点赞计数和 24 小时限流记录在 SQLite。
   - 管理备份版本升级为 3，包含 `legacyFiles` 和 `likes`。

5. 已加入验证。
   - `tests/legacy-files.test.ts`：路径校验、SQLite 覆盖、删除 tombstone。
   - `tests/legacy-transport.test.ts`：旧 blob/tree 提交流程转换为本地文件写入。

## 已验证

以下命令当前通过：

```powershell
pnpm test
pnpm typecheck
pnpm build
```

测试结果：8 个测试全部通过。

最新 SQLite 传输和点赞改造完成后，`pnpm build` 已重新通过，全部旧站、新文档和 API 路由均完成生产构建。

已做本地烟测：

- 管理员登录：`POST /api/manage/login` 返回 200。
- 登录状态：`/api/legacy?session=1` 返回 `authenticated: true`。
- 旧博客 Markdown 写入 `legacy_files` 后，`/blogs/.../index.md` 返回 200 且内容可读回。
- 点赞首次返回 200，重复请求返回 `reason: rate_limited`，计数保持 1。
- 旧页面和资源均曾返回 200：`/`、`/about`、`/blog`、`/blog/readme`、`/projects`、`/pictures`、`/share`、`/bloggers`、`/snippets`、`/write`、`/docs`、`/sections/1`、`/search`、`/admin`、`/blogs/index.json`、`/images/avatar.png`。

## 当前运行方式

开发服务运行在：`http://localhost:2025`

启动命令：

```powershell
pnpm dev
```

本机 `.env.local` 已生成且被 `.gitignore` 忽略，包含随机管理员密码和 SESSION_SECRET。密码只保存在本机文件中；接手者应从 `.env.local` 读取，或重新生成一份本地配置。

## 未完成 / 风险

1. 旧站设置中无效的“缓存 PEM”控件和默认配置键已移除。原有 `src/lib/aes256-util.ts` 当前没有引用，未擅自删除。
3. `src/lib/github-client.ts` 现在是兼容层，不再调用 GitHub API；如果要发布到多实例环境，需要共享 `DATA_DIR` 或迁移到共享数据库/对象存储。
4. 旧站的 `list.json`、站点配置和文章资源采用“仓库文件 + SQLite 覆盖层”读取策略。管理员修改后当前实例立即生效，其他实例不会自动同步。
5. 当前工作区本来就存在大量用户未提交改动和删除记录。本次没有清理、回滚或提交这些改动；提交时需要按整体迁移检查 diff。

## 建议下一步

1. Docker Linux 引擎启动后执行 Compose 与持久化卷重建验收。
2. 浏览器控制服务可用后，检查旧站编辑后刷新、移动端首页卡片、导航折叠、`/docs` 阅读布局、代码复制和后台交互。
3. 审阅 `package.json`、`pnpm-lock.yaml` 的整体迁移依赖变化与未提交 diff。

## 2026-09-25 续开发验收

- 在隔离的临时 `DATA_DIR` 上运行生产服务，`tests/smoke.ps1` 通过：登录边界、草稿隔离、发布与搜索、版本恢复、图片上传、撤回、备份恢复。烟测脚本已适配恢复后的旧站首页，并可读取环境变量中的管理员凭据。
- 旧站与文档站的 20 个主要页面及资源入口均返回 200。
- 修复旧站鉴权模块在服务端导入时请求相对 URL 的错误；新增回归测试，重新启动生产服务后确认旧站页面请求无该异常。
- `pnpm test`（8/8）、`pnpm typecheck`、`pnpm build` 通过。
- Docker Linux 引擎未运行；浏览器控制服务没有可用浏览器，因此容器和视觉交互仍未验收。
