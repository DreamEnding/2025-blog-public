# Docker 部署

项目的前端页面、管理后台和 API 运行在同一个 Next.js 容器中。SQLite 数据库和后台上传的图片保存在 Docker 卷 `site_data`，无需另起数据库容器。服务器需要 Docker Engine 和 Docker Compose 插件。

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
docker compose up -d --build
docker compose ps
```

访问 `SITE_URL` 查看网站，访问 `/admin` 使用上面设置的账号登录。首启时自动创建 SQLite 数据库和五个空栏目。后台保存和发布的内容立即生效，无需重建镜像。`SITE_URL` 在镜像构建时写入站点地图和 RSS 地址；修改域名后需要重新执行 `docker compose up -d --build`。

## 更新与备份

```bash
git pull
docker compose up -d --build
```

更新和重建容器不会删除 `site_data` 卷。该卷保存 `/data/site.db`、SQLite WAL 文件和 `/data/uploads/`。升级前在后台“备份恢复”下载 JSON 备份并妥善保存；备份包含栏目、草稿、公开版本、设置和图片。恢复到空实例时，先部署并登录，再上传备份。恢复会覆盖当前全部栏目、文档、设置和图片。

还应定期备份 Docker 卷；复制卷文件前停止容器，避免 SQLite 数据库与 WAL 文件不一致。不要运行 `docker compose down -v`，该命令会删除数据卷。

部署在反向代理后时，使用 HTTPS，并转发原始 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto` 请求头；后台修改请求会校验来源域名。不要将 `.env` 或数据卷暴露为静态文件。镜像包含原生 SQLite 模块，服务器应使用 Linux `amd64` 或 `arm64`，由服务器本地执行构建。
