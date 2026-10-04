import { NextResponse } from 'next/server'
import { adminSessionScope, isAdmin, login, logout, sameOrigin, verifyPassword } from '@/lib/site-auth'
import {
	adminData,
	createEntry,
	createSection,
	deleteEntry,
	deleteSection,
	publishEntry,
	restoreEntry,
	saveEntry,
	saveSettings,
	updateSection,
	withdrawEntry
} from '@/lib/site-actions'
import { dataDir, db } from '@/lib/site-db'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validLegacyPath } from '@/lib/legacy-files'
import {
	deleteSubscription,
	importRssItem,
	previewRssItem,
	refreshSubscription,
	rssData,
	checkRsshub,
	saveRsshub,
	saveRssSettings,
	saveSubscription,
	validateRssBackup
} from '@/lib/site-rss'
import { importImage, listImages, localizeImages, storeImage } from '@/lib/site-images'
import { httpUrl } from '@/lib/rss-network'
import { zhihuLoginAction, zhihuLoginFrame } from '@/lib/zhihu-login'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers: Record<string, (input: Record<string, unknown>) => unknown> = {
	'create-section': createSection,
	'update-section': updateSection,
	'delete-section': deleteSection,
	'create-entry': createEntry,
	'save-entry': saveEntry,
	'publish-entry': publishEntry,
	'withdraw-entry': withdrawEntry,
	'restore-entry': restoreEntry,
	'delete-entry': deleteEntry,
	'save-settings': saveSettings,
	'save-rsshub': saveRsshub,
	'save-rss-settings': saveRssSettings,
	'check-rsshub': checkRsshub,
	'save-subscription': saveSubscription,
	'delete-subscription': deleteSubscription,
	'refresh-subscription': refreshSubscription,
	'preview-rss-item': previewRssItem,
	'import-rss-item': importRssItem,
	'import-image': input => importImage(input.url),
	'localize-images': input => {
		if (typeof input.body !== 'string' || input.body.length > 1_000_000) throw new Error('正文无效')
		return localizeImages(input.body)
	}
}

function json(value: unknown, status = 200) {
	return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

type Context = { params: Promise<{ path: string[] }> }

export async function GET(request: Request, context: Context) {
	const action = (await context.params).path[0]
	if (!(await isAdmin())) return json({ error: '请先登录' }, 401)
	if (action === 'data') return json(adminData())
	if (action === 'images') return json(await listImages())
	if (action === 'zhihu-login-frame') {
		try {
			const id = new URL(request.url).searchParams.get('id') || ''
			const bytes = await zhihuLoginFrame(id, await adminSessionScope())
			return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : '登录画面暂不可用' }, 400)
		}
	}
	if (action === 'rss') {
		try {
			const selected = new URL(request.url).searchParams.get('subscription')
			return json(rssData(selected === null ? undefined : Number(selected)))
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : '订阅读取失败' }, 400)
		}
	}
	if (action === 'backup') {
		const imageDir = path.join(dataDir(), 'uploads')
		await mkdir(imageDir, { recursive: true })
		const images = Object.fromEntries(
			await Promise.all((await readdir(imageDir)).map(async filename => [filename, (await readFile(path.join(imageDir, filename))).toString('base64')]))
		)
		const backup = {
			version: 4,
			sections: db().prepare('SELECT * FROM sections').all(),
			entries: db().prepare('SELECT * FROM entries').all(),
			settings: db().prepare('SELECT * FROM settings').all(),
			rssSubscriptions: db().prepare('SELECT * FROM rss_subscriptions').all(),
			rssItems: db().prepare('SELECT * FROM rss_items').all(),
			legacyFiles: (db().prepare('SELECT path, content, deleted FROM legacy_files').all() as { path: string; content: Buffer | null; deleted: number }[]).map(
				file => ({
					path: file.path,
					content: file.content?.toString('base64') || null,
					deleted: file.deleted
				})
			),
			likes: db().prepare('SELECT slug, count FROM likes').all(),
			images
		}
		return new Response(JSON.stringify(backup), {
			headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="site-backup.json"', 'Cache-Control': 'no-store' }
		})
	}
	return json({ error: '未知操作' }, 404)
}

export async function POST(request: Request, context: Context) {
	if (!(await sameOrigin(request))) return json({ error: '请求来源无效' }, 403)
	const action = (await context.params).path[0]
	try {
		if (action === 'login') {
			const input = await request.json()
			if (!verifyPassword(input.username, input.password)) return json({ error: '账号或密码错误' }, 401)
			await login()
			return json({ ok: true })
		}
		if (!(await isAdmin())) return json({ error: '请先登录' }, 401)
		if (action === 'logout') {
			await logout()
			return json({ ok: true })
		}
		if (['zhihu-login-start', 'zhihu-login-status', 'zhihu-login-pointer', 'zhihu-login-cancel', 'zhihu-login-complete'].includes(action)) {
			const input = await request.json()
			const operation = action.slice('zhihu-login-'.length) as 'start' | 'status' | 'pointer' | 'cancel' | 'complete'
			return json({ ok: true, result: await zhihuLoginAction(operation, input, await adminSessionScope()) })
		}
		if (action === 'upload') {
			const form = await request.formData()
			const file = form.get('file')
			if (!(file instanceof File) || file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error('图片大小必须在 1B 到 8MB 之间')
			return json({ url: await storeImage(Buffer.from(await file.arrayBuffer()), file.type) })
		}
		if (action === 'restore-backup') {
			const input = await request.json()
			if (input.confirm !== '覆盖全部数据') throw new Error('请确认覆盖范围')
			const backup = input.backup
			if (
				![1, 2, 3, 4].includes(backup?.version) ||
				!Array.isArray(backup.sections) ||
				!Array.isArray(backup.entries) ||
				!Array.isArray(backup.settings) ||
				!backup.images ||
				typeof backup.images !== 'object'
			)
				throw new Error('备份格式无效')
			if (backup.sections.length > 1000 || backup.entries.length > 10000 || Object.keys(backup.images).length > 10000) throw new Error('备份超过限制')
			const fixed = new Map([
				['API 文档', 'docs'],
				['使用教程', 'articles'],
				['AI 技术分享', 'articles']
			])
			if (
				backup.sections.length !== fixed.size ||
				new Set(backup.sections.map((row: { name: string }) => row.name)).size !== fixed.size ||
				backup.sections.some((row: { name: string; kind: string; parent_id: number | null }) => fixed.get(row.name) !== row.kind || row.parent_id !== null)
			)
				throw new Error('备份栏目必须是三个固定栏目')
			for (const name of ['API 文档', '使用教程']) {
				const sectionId = backup.sections.find((row: { name: string }) => row.name === name).id
				if (
					backup.entries.filter(
						(row: { section_id: number; public_section_id: number | null; published: number }) =>
							row.section_id === sectionId || (row.published && row.public_section_id === sectionId)
					).length > 1
				)
					throw new Error(`${name}最多保留一篇`)
			}
			const legacyFiles = backup.version >= 3 ? backup.legacyFiles : []
			const likes = backup.version >= 3 ? backup.likes : []
			const rssSubscriptions = backup.version === 4 ? backup.rssSubscriptions : []
			const rssItems = backup.version === 4 ? backup.rssItems : []
			validateRssBackup(rssSubscriptions, rssItems)
			for (const row of backup.entries) if (row.source_url != null) httpUrl(row.source_url)
			for (const row of backup.settings) if (row.key === 'rsshub_url') httpUrl(row.value)
			if (!Array.isArray(legacyFiles) || !Array.isArray(likes) || legacyFiles.length > 20000 || likes.length > 20000) throw new Error('备份内容无效')
			for (const file of legacyFiles) {
				if (
					typeof file.path !== 'string' ||
					!validLegacyPath(file.path) ||
					![0, 1].includes(file.deleted) ||
					(file.deleted === 0 && (typeof file.content !== 'string' || file.content.length > 16_000_000))
				)
					throw new Error('备份文件无效')
				if (
					file.path.startsWith('public/blogs/') ||
					['src/app/projects/list.json', 'src/app/share/list.json', 'src/app/bloggers/list.json'].includes(file.path)
				)
					throw new Error('备份包含已移除的旧内容')
			}
			for (const like of likes)
				if (typeof like.slug !== 'string' || like.slug.length > 150 || !Number.isSafeInteger(like.count) || like.count < 0) throw new Error('备份点赞数据无效')
			const images = Object.entries(backup.images) as [string, string][]
			for (const [name, value] of images) {
				if (!/^[\da-f-]{36}\.(png|jpg|webp|gif)$/.test(name) || typeof value !== 'string' || value.length > 12_000_000) throw new Error('备份图片无效')
			}
			db().transaction(() => {
				db().prepare('DELETE FROM rss_items').run()
				db().prepare('DELETE FROM rss_subscriptions').run()
				db().prepare('DELETE FROM entries').run()
				db().prepare('DELETE FROM sections').run()
				db().prepare('DELETE FROM settings').run()
				db().prepare('DELETE FROM legacy_files').run()
				db().prepare('DELETE FROM likes').run()
				db().prepare('DELETE FROM like_events').run()
				const insertSection = db().prepare('INSERT INTO sections (id, name, kind, parent_id, position) VALUES (@id, @name, @kind, @parent_id, @position)')
				for (const row of backup.sections) insertSection.run(row)
				const insertEntry = db()
					.prepare(`INSERT INTO entries (id, section_id, title, summary, body, position, published, public_title, public_summary, public_body,
					public_section_id, public_position, previous_title, previous_summary, previous_body, previous_section_id, previous_position, published_at, source_url)
					VALUES (@id, @section_id, @title, @summary, @body, @position, @published, @public_title, @public_summary, @public_body,
					@public_section_id, @public_position, @previous_title, @previous_summary, @previous_body, @previous_section_id, @previous_position, @published_at, @source_url)`)
				for (const row of backup.entries)
					insertEntry.run({
						...row,
						public_section_id: row.public_section_id ?? (row.public_title ? row.section_id : null),
						public_position: row.public_position ?? (row.public_title ? row.position : null),
						previous_section_id: row.previous_section_id ?? (row.previous_title ? row.section_id : null),
						previous_position: row.previous_position ?? (row.previous_title ? row.position : null),
						source_url: row.source_url ?? null
					})
				const insertSetting = db().prepare('INSERT INTO settings (key, value) VALUES (@key, @value)')
				for (const row of backup.settings) insertSetting.run(row)
				const insertSubscription = db().prepare(
					'INSERT INTO rss_subscriptions (id, name, url, refreshed_at, error) VALUES (@id, @name, @url, @refreshed_at, @error)'
				)
				for (const row of rssSubscriptions) insertSubscription.run(row)
				const insertItem = db().prepare(
					'INSERT INTO rss_items (id, subscription_id, title, link, author, published_at, html) VALUES (@id, @subscription_id, @title, @link, @author, @published_at, @html)'
				)
				for (const row of rssItems) insertItem.run(row)
				const insertLegacyFile = db().prepare('INSERT INTO legacy_files (path, content, deleted) VALUES (?, ?, ?)')
				for (const file of legacyFiles) insertLegacyFile.run(file.path, file.deleted ? null : Buffer.from(file.content, 'base64'), file.deleted)
				const insertLike = db().prepare('INSERT INTO likes (slug, count) VALUES (?, ?)')
				for (const like of likes) insertLike.run(like.slug, like.count)
			})()
			const imageDir = path.join(dataDir(), 'uploads')
			await rm(imageDir, { recursive: true, force: true })
			await mkdir(imageDir, { recursive: true })
			for (const [name, value] of images) await writeFile(path.join(imageDir, name), Buffer.from(value, 'base64'))
			return json({ ok: true })
		}
		const handler = handlers[action]
		if (!handler) return json({ error: '未知操作' }, 404)
		const input = await request.json()
		return json({ ok: true, result: await handler(input) })
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : '请求失败' }, 400)
	}
}
