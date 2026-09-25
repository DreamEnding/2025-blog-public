# Repository Guidelines

## Project Structure & Module Organization

This is a self-hosted Next.js 16, React, and TypeScript documentation site. Public routes are in `src/app/(home)/`, `src/app/docs/`, `src/app/sections/`, and `src/app/search/`; the administrator UI is in `src/app/admin/`. Server endpoints live in `src/app/api/`. SQLite initialization, content operations, and session checks are in `src/lib/site-db.ts`, `site-actions.ts`, and `site-auth.ts`. Markdown rendering is shared through `src/lib/markdown-renderer.ts` and `src/components/docs-markdown.tsx`. Styles are in `src/styles/`, tests in `tests/`, and deployment instructions in `docs/deployment.md`.

## Build, Test, and Development Commands

Use Node.js 22+ and pnpm 10. Run `pnpm install`, then `pnpm dev` for local development on port 2025. `pnpm typecheck` checks TypeScript; `pnpm test` runs the Node tests through tsx; `pnpm build` creates the production Next.js build. `pnpm start` serves that build. For self-hosted deployment, configure `.env` from `.env.example` and run `docker compose up -d --build` as described in `docs/deployment.md`.

## Coding Style & Naming Conventions

Use TypeScript and follow nearby modules. Files use lowercase kebab-case, such as `site-actions.ts` and `docs-markdown.tsx`; React components use PascalCase. The `@/` alias resolves to `src/`. Prettier uses tabs (width 2), single quotes, no semicolons, and Tailwind class sorting. Format touched files with `pnpm exec prettier --write <path>`.

## Testing Guidelines

Keep focused `*.test.ts` files in `tests/`. Add cases for invalid input, authorization boundaries, draft visibility, and publication transitions when changing those paths. There is no coverage threshold. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before a pull request. `tests/smoke.ps1` exercises the local HTTP workflow with test credentials and modifies content; run it only against a disposable local instance.

## Commit & Pull Request Guidelines

History favors short, specific subjects, often Chinese action phrases such as `修复 Star History 图表` or `更新博主列表`. Keep commits focused. In pull requests, explain the behavior changed, list checks run, link a relevant issue, and add screenshots for visible UI changes.

## Security & Data

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a 32-character or longer `SESSION_SECRET` through deployment configuration. Never commit local `.env` files, SQLite data, or uploaded files; `.env.example` contains placeholders only. The local `data/` directory and Docker `site_data` volume hold persistent content. Public reads must use published snapshots; saving a draft must not change public pages or search results.
