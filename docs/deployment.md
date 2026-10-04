# Docker 部署

Compose 还包含独立的 RSSHub 服务，网站通过内部地址 `http://rsshub:1200` 读取订阅。RSSHub 的 1200 端口不对公网开放；启动后直接在后台「RSS 订阅」中使用，无需手动部署另一个服务。

## RSS 订阅与文章摘录

登录浏览器首次使用时会通过已保存的抓取代理尝试从 Noto 官方仓库下载中文字体和 SIL OFL 许可证，并缓存到容器内；后续打开登录页复用缓存。字体不可下载时仍可扫码，但部分中文可能缺字。

后台「RSS 订阅 → 抓取配置 → 知乎扫码登录」会打开知乎官方登录页面。选择页面中的扫码方式，用知乎 App 扫码并确认；出现验证码时由你手动完成。登录成功后会自动保存包含 `z_c0` 的知乎 Cookie，并加载到 RSSHub，前端只显示已配置，不回传 Cookie 明文。登录会话独立于你已有的浏览器，取消或 10 分钟超时会关闭；可以点击或拖动登录画面操作页面，二维码过期时点击「重新扫码」。

扫码登录使用已保存的 RSSHub 抓取代理，修改代理后应先保存。首次部署需使用 `ghcr.io/diygod/rsshub:chromium-bundled` 镜像，并将整个 `rsshub/` 控制程序目录只读挂载到 `/rsshub-control`，Compose 已包含这些配置。登录内部接口对请求和响应签名、限制当前管理员会话归属，不向公网暴露登录控制端口。外部 RSSHub 实例需接入相同的配套程序及私有配置后才能使用自动登录。

后台已预设知乎作者 `https://www.zhihu.com/people/zhang-xiao-yu-45-67-74`。进入「RSS 订阅」点击刷新，选择文章预览，再点击「导入并编辑」。导入只创建「AI 技术分享」草稿，保留作者、日期和原文链接；不会自动发布。代码、表格、列表、知乎图片和公式会转换为站内 Markdown。订阅仅提供摘要时，导入内容也只有摘要；后台预览用于确认内容是否完整。

在内容编辑器中修改正文和摘要、检查分屏预览，然后点击「发布文章」。已发布文章可通过「更多文章操作 → 撤回发布」下架，下架后公开页面返回 404，站内搜索和本站 RSS 隐藏该文，草稿仍可编辑并再次发布。刷新源订阅和重复导入不会覆盖编辑过的草稿或已发布版本。

支持添加知乎作者主页、专栏主页、RSSHub 路由或完整 RSS URL。例如作者路由为 `/zhihu/posts/people/用户名`，专栏路由为 `/zhihu/zhuanlan/专栏ID`。后台可修改 RSSHub 服务地址以连接其他实例；删除订阅只删除候选列表，已导入文章继续保留。刷新由管理员手动触发，每次读取订阅前 100 条，本地候选列表会保留历史已获取条目。

知乎可能限制未登录或特定 IP 的抓取。如果刷新返回 403、429 或路由错误，在后台「RSS 订阅 → 抓取配置」粘贴知乎登录后的完整 Cookie 请求头内容并保存。配套 RSSHub 会自动重启抓取进程、清除内存缓存并加载 Cookie；无需手动修改 `.env` 或重建镜像。后台「检查服务连接」确认服务和配置已加载，再刷新作者订阅验证 Cookie 是否有效。Cookie 是否能解除访问限制仍取决于知乎当前的账号、IP 和风控状态。

同一表单还可配置 RSSHub 服务地址、RSSHub 抓取代理及网站下载代理。敏感输入保存后清空，只显示“已配置”；留空保留原值。勾选「清空已保存的知乎 Cookie」或「停用此代理」并保存，可明确清空配置，包括覆盖旧环境变量的默认值。代理支持 HTTP/HTTPS，允许地址中包含用户名密码；代理摘要会遮蔽账号密码。

配套 RSSHub 使用 `rsshub/runtime.mjs` 启动，读取独立卷 `rsshub_config` 的私有配置，自动重启抓取进程，并提供不含敏感值的加载状态。网站容器写配置，RSSHub 只读挂载；不需要挂载 Docker socket。使用外部 RSSHub 仍可配置服务地址及网站下载代理，但本后台不能修改外部实例的 Cookie/代理，保存时会明确提示未接入配置同步。首次升级应运行 `docker compose up -d` 更新服务启动方式；源码中的启动脚本需要随 Compose 文件保留。

导入时自动将远程配图转存到 `/data/uploads`。不支持的格式或下载失败的图片保留原地址并显示原因，可在编辑器点击「转存正文远程图片」重试，也可从「图片库」上传或转存替换图片。图片库支持缩略图、放大预览、复制 URL 和插入当前草稿；图片说明和地址在 Markdown 编辑器中编辑。仅支持 PNG、JPEG、WebP、GIF，单图最多 8MB，单篇最多转存 100 张远程图片。

本地开发启动 RSSHub 后，在后台填写服务地址 `http://127.0.0.1:1200`。本机命令的代理为 `http://127.0.0.1:7897`。本地 Next.js 的「网站下载代理」可填写此地址；「RSSHub 抓取代理」要填写容器可访问的地址，例如 `http://host.docker.internal:7897`。整站在 Docker 内运行时，两个代理都应填写容器可访问的地址，不能用容器自己的 127.0.0.1。内部 RSSHub 服务请求直接连接。原有 `.env` 中 `ZHIHU_COOKIES`、`RSSHUB_PROXY_URI` 和 `RSS_FETCH_PROXY` 仅作为未保存配置时的兼容默认值，后台设置优先。

本地通过 `pnpm dev` 运行网站时，可在项目目录运行以下 PowerShell 命令，挂载私有配置目录及加载程序，仅将开发端口绑定到本机。使用自定义 `DATA_DIR` 时，将配置目录改为对应的 `<DATA_DIR>/rsshub`。

```powershell
New-Item -ItemType Directory -Force ./data/rsshub | Out-Null
docker run -d --name rsshub-dev -p 127.0.0.1:1200:1200 -e RSSHUB_RUNTIME_FILE=/rsshub-config/runtime.json --mount "type=bind,source=$PWD/rsshub,target=/rsshub-control,readonly" --mount "type=bind,source=$PWD/data/rsshub,target=/rsshub-config,readonly" ghcr.io/diygod/rsshub:chromium-bundled node /rsshub-control/runtime.mjs
```

在新代码尚未经 GitHub Actions 发布镜像时，Compose 中的网站镜像仍可能是旧版本。需要测试当前工作区的容器版时，先执行 `docker build -t ghcr.io/dreamending/2025-blog-public:latest .`，再执行 `docker compose up -d`，以使用本地构建的新功能；不要在这之后执行 `docker compose pull docs` 覆盖本地镜像。

备份版本为 4，包含订阅、候选文章、来源去重关联及本地图床；仍可恢复版本 1–3 的旧备份，旧备份的订阅列表为空。Cookie 和代理凭据存放于独立私有配置文件，不进入普通后台数据、公开页面或 JSON 内容备份；恢复内容备份不会覆盖它们。需单独保护和备份 `rsshub_config` 卷。本地配置默认位于 `<DATA_DIR>/rsshub/runtime.json`，可通过部署环境 `RSSHUB_RUNTIME_FILE` 指定共享位置，不应公开这个目录。

项目的前端页面、管理后台和 API 运行在同一个 Next.js 容器中。SQLite 数据库和后台上传的图片保存在 Docker 卷 `site_data`，无需另起数据库容器。GitHub Actions 将 `main` 构建并发布到 `ghcr.io/dreamending/2025-blog-public:latest`；服务器只需 Docker Engine 和 Docker Compose 插件，无需安装 Node.js 或在服务器构建镜像。

## 首次部署

在服务器执行：

```bash
git clone https://github.com/DreamEnding/2025-blog-public.git
cd 2025-blog-public
cp .env.example .env
```

编辑 `.env`：设置 `ADMIN_USERNAME`、强密码 `ADMIN_PASSWORD`、至少 32 字符的随机 `SESSION_SECRET`，并将 `SITE_URL` 改为网站最终的访问地址（例如 `https://docs.example.com`，不要加末尾斜杠）。可以用 `openssl rand -hex 32` 生成密钥。`SITE_PORT` 是服务器对外开放的端口，默认 3000；使用反向代理时可以设为 `127.0.0.1:3000`，使端口只监听本机。不要提交 `.env`。

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

访问 `SITE_URL` 查看网站，访问 `/admin` 使用上面设置的账号登录。首启时自动创建 SQLite 数据库和三个固定栏目，并导入 API 文档与 Nexus AI 使用教程；AI 技术分享初始为空。API 文档与使用教程各限一篇。后台保存和发布的内容立即生效，无需重建镜像。页面 Canonical、站点地图和 RSS 在容器运行时读取 `SITE_URL`；修改域名后重新执行 `docker compose up -d`。

## 更新与备份

```bash
git pull
docker compose pull
docker compose up -d
```

更新和重建容器不会删除 `site_data` 卷。该卷保存 `/data/site.db`、SQLite WAL 文件和 `/data/uploads/`。升级前在后台“备份恢复”下载 JSON 备份并妥善保存；备份包含栏目、草稿、公开版本、设置和图片。恢复到空实例时，先部署并登录，再上传备份。恢复会覆盖当前全部栏目、文档、设置和图片。

还应定期备份 Docker 卷；复制卷文件前停止容器，避免 SQLite 数据库与 WAL 文件不一致。不要运行 `docker compose down -v`，该命令会删除数据卷。

从早期栏目或旧博客版本升级时，先保存完整数据卷副本。当前初始化包含一次性内容迁移：备份数据库为 `site-before-content-redesign.db`，将非空上传目录保留为 `uploads-before-content-redesign`，然后清空旧栏目、文章、旧博客覆盖文件与点赞，建立三个固定栏目。当前后台恢复只接受这三个栏目，且 API 文档和使用教程各最多一篇；旧备份须先整理为当前内容结构，不能直接导入。需要回退历史实例时，应恢复升级前的完整数据卷并使用相应旧镜像。

部署在反向代理后时，使用 HTTPS，并转发原始 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto` 请求头；后台修改请求会校验来源域名。不要将 `.env` 或数据卷暴露为静态文件。镜像同时提供 Linux `amd64` 和 `arm64` 版本。
