# Chream 博客与文档站

基于 Next.js 16、React 19、TypeScript 和 SQLite 的中文个人网站。保留卡片式首页，提供 Nexus API 文档、使用教程和 AI 技术分享。单管理员可在网页后台编辑、预览和发布 Markdown，无需通过 GitHub 提交或重新部署。

## 页面与内容

| 页面              | 路径               | 内容规则                             |
| ----------------- | ------------------ | ------------------------------------ |
| 个人首页          | `/`                | 卡片、社交链接、音乐和外观设置       |
| API 文档          | `/api-docs`        | 单篇文档；`/docs` 重定向至此         |
| 使用教程          | `/tutorials`       | 单篇图文教程                         |
| AI 技术分享       | `/ai-sharing`      | 多篇文章，详情位于 `/articles/[id]`  |
| 近期文章          | `/blog`            | 使用教程与 AI 技术分享按发布时间排列 |
| 全站搜索          | `/search`          | 仅搜索已发布的标题、摘要和正文       |
| 关于网站          | `/about`           | 站点介绍                             |
| 管理后台 / 写文章 | `/admin`、`/write` | 管理员登录后使用                     |

栏目固定为三个：API 文档、使用教程、AI 技术分享。API 文档与使用教程各最多一篇，草稿和现有公开版本都会占用该栏目的名额。首启自动导入仓库里的 API 文档与 Nexus AI 使用教程；AI 技术分享初始为空。

## 内容管理与站点设置

- `/admin` 与 `/write` 使用同一套创作工作台，沿用首页主题配色。Markdown 编辑器提供行号、语法提示、格式工具、查找替换、撤销重做、分屏预览和专注模式；支持上传、粘贴或拖入图片。
- 停止输入约 1.2 秒后自动保存草稿，也可用 `Ctrl+S` 保存、`Ctrl+Enter` 发布。保存期间继续输入不会被旧请求覆盖；切换文章或发布前会保存最新修改。当前标签页会暂存未保存的草稿，在服务端记录未被其他操作更改时恢复。
- 保存草稿不会改变公开页面、搜索结果或 RSS；发布后立即生效。支持撤回和恢复上一次发布版本。
- 后台“站点设置”管理网站名称、作者、介绍、头像、社交链接、统计 ID 和控制台入口。基础信息与首页设置共享同一份配置，页面标题、摘要和 RSS 随之更新。未配置统计 ID 时不加载 Google Analytics。
- 首页设置继续管理外观、布局、Favicon 和其他卡片配置。上传头像后，首页和导航使用更新后的头像。
- 公开文档正文在服务端渲染，保留目录跳转、代码复制和图片预览。站点提供独立页面标题、Canonical、`/sitemap.xml`、`/robots.txt` 和 `/rss.xml`。

## 本地开发

后台「知乎扫码登录」提供官方网页登录画面，你扫码并完成必要验证后，会自动保存知乎 Cookie 到私有配置并加载到 RSSHub；支持取消、超时和重新扫码。配套 RSSHub 镜像包含 Chromium，无需在网站容器额外安装浏览器。

后台「RSS 订阅」可配置 RSSHub 服务地址、知乎 Cookie、RSSHub 抓取代理和网站下载代理，保存后配套 RSSHub 自动加载，支持检查连接、保留/替换/清空敏感值。还可添加知乎作者或专栏、刷新并预览候选文章，选择导入「AI 技术分享」草稿，再编辑、发布或撤回。已预设用户指定的知乎作者；导入会保留原文链接及作者，并将配图转存到本地图床。后台「图片库」提供上传、远程图片转存、预览、复制地址和插入草稿。Compose 随项目启动独立 RSSHub，配置方式见 [部署说明](docs/deployment.md#rss-订阅与文章摘录)。

需要 Node.js 22.19+ 和 pnpm 10。复制 `.env.example` 为 `.env.local`，设置管理员账号、密码和至少 32 字符的 `SESSION_SECRET`，然后运行：

```powershell
pnpm install
pnpm dev
```

访问 `http://localhost:2025` 查看站点，`/admin` 登录后台。SQLite 数据和上传图片默认保存在项目根目录的 `data/`，已加入 `.gitignore`。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm build
pwsh -NoProfile -File ./tests/check-build-safety.ps1
```

构建产物检查会拒绝包含本地数据库、测试数据、环境配置或交接记录的 standalone 包。运行时数据通过 `DATA_DIR` 挂载，不打包进程序。

`tests/smoke.ps1` 可在隔离的 `DATA_DIR` 和测试凭据下验证登录、单篇限制、草稿隔离、发布、正文首屏、搜索、设置、图片及备份恢复。不要对生产站点运行该脚本，它会创建并修改内容。

本地隔离验收可在 PowerShell 7 运行以下脚本。它会创建临时数据目录，并仅监听 `127.0.0.1:2035`：

```powershell
pwsh -NoProfile -File ./tests/start-verification.ps1
```

界面开发验收可加 `-Development`，使用支持热更新的 `http://127.0.0.1:2036`；同样使用独立临时数据和测试凭据。

RSS 摘录可另外运行 `pnpm exec tsx tests/rss-fixture.ts`，在 2037 端口提供本地验收订阅源，再运行 `pwsh -NoProfile -File ./tests/rss-smoke.ps1`。该脚本只应对隔离实例使用，会检查候选刷新、转换预览、草稿导入、重复导入、发布/下架，以及新版和旧版备份恢复，结束时恢复测试前的内容。

配套 RSSHub 启动后，`pwsh -NoProfile -File ./tests/rss-settings-smoke.ps1` 验证后台抓取配置、敏感信息遮蔽、权限和自动加载；仅用于 Cookie 和网站下载代理为空的隔离实例。更新预览时可给 `start-verification.ps1` 传入 `-DataDirectory` 复用此前的临时验收目录，脚本只接受临时目录中的 `chream-verify-*` 路径。

在另一个终端运行烟测；验收完成后，在服务终端按 Ctrl+C 停止：

```powershell
pwsh -NoProfile -File ./tests/smoke.ps1 -Base http://127.0.0.1:2035
```

## 部署

使用 Docker Compose 自托管，配置和升级步骤见 [部署说明](docs/deployment.md)。GitHub Actions 发布镜像到 GHCR，Compose 卷持久化数据库和图片。后台可导出内容、草稿、公开版本、站点配置、兼容文件及上传图片的 JSON 备份，并恢复到空实例。

管理员修改的内容保存在 SQLite 和数据目录中，不会写回仓库。`docs/API docs.md` 和 `public/tutorials/nexus-ai/tutorial.md` 是首启导入源；已有实例的后续内容更新应通过后台完成。

历史版本升级前请备份完整数据卷。当前恢复功能要求三个固定栏目，并校验 API 文档与教程的单篇限制；旧栏目或旧博客内容不能直接通过后台导入，迁移说明见部署文档。
