# 自托管 API 文档站

基于 Next.js、SQLite 的中文文档站。公开阅读 API 文档、使用教程、模型选择、AI 技术分享和求职面经；单管理员可在网页后台直接编辑、预览和发布 Markdown，无需通过 GitHub 提交或重新部署。

## 本地开发

需要 Node.js 22+ 和 pnpm 10。复制 `.env.example` 为 `.env.local`，设置管理员账号、密码和至少 32 字符的 `SESSION_SECRET`，然后运行：

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
```

`tests/smoke.ps1` 可在使用测试凭据运行的本地服务器上验证登录、草稿隔离、发布、搜索、图片及备份恢复。不要对生产站点运行该脚本，它会创建并修改内容。

## 部署

使用 Docker Compose 自托管，配置和升级步骤见 [部署说明](docs/deployment.md)。Compose 卷持久化数据库和图片。后台可导出包含全部内容与上传图片的 JSON 备份，并恢复到空实例。
