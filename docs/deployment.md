# 自托管部署

需要 Docker Engine 和 Compose。将 `.env.example` 复制为 `.env`，设置 `ADMIN_USERNAME`、强密码 `ADMIN_PASSWORD` 和至少 32 字符的随机 `SESSION_SECRET`。`.env` 不要提交到 Git。

在服务器运行：

```powershell
docker compose up -d --build
```

网站默认监听 3000 端口，可通过 `SITE_PORT` 修改。公开页面无需登录；访问 `/admin` 登录并管理内容。首启会创建五个空栏目。内容发布后立即从 SQLite 读取，无需重建容器。后台图片上传保存到同一持久化卷。

Compose 的 `site_data` 卷包含 `/data/site.db` 和 `/data/uploads/`。更新代码后重新运行 `docker compose up -d --build`，卷保持不变。升级前在后台“备份恢复”下载 JSON 备份并妥善保存；备份包含栏目、草稿、公开版本、设置和图片。恢复到空实例时，先部署并登录，再上传备份。恢复会覆盖当前全部栏目、文档、设置和图片，界面会再次要求确认。

部署在反向代理后时，请转发原始 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto` 请求头，并使用 HTTPS。后台修改请求会校验来源域名。请让持久化卷定期由服务器备份方案备份；不要将卷或 `.env` 暴露为静态文件。
