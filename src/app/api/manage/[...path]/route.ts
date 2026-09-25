import { NextResponse } from 'next/server'
import { isAdmin, login, logout, sameOrigin, verifyPassword } from '@/lib/site-auth'
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
import { randomUUID } from 'node:crypto'
import { validLegacyPath } from '@/lib/legacy-files'

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
	'save-settings': saveSettings
}

function json(value: unknown, status = 200) {
	return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

type Context = { params: Promise<{ path: string[] }> }

export async function GET(_request: Request, context: Context) {
	const action = (await context.params).path[0]
	if (!(await isAdmin())) return json({ error: '请先登录' }, 401)
	if (action === 'data') return json(adminData())
	if (action === 'backup') {
		const imageDir = path.join(dataDir(), 'uploads')
		await mkdir(imageDir, { recursive: true })
		const images = Object.fromEntries(
			await Promise.all((await readdir(imageDir)).map(async filename => [filename, (await readFile(path.join(imageDir, filename))).toString('base64')]))
		)
		const backup = {
			version: 3,
			sections: db().prepare('SELECT * FROM sections').all(),
			entries: db().prepare('SELECT * FROM entries').all(),
			settings: db().prepare('SELECT * FROM settings').all(),
			legacyFiles: (db().prepare('SELECT path, content, deleted FROM legacy_files').all() as { path: string; content: Buffer | null; deleted: number }[]).map(file => ({
				path: file.path,
				content: file.content?.toString('base64') || null,
				deleted: file.deleted
			})),
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
		if (action === 'upload') {
			const form = await request.formData()
			const file = form.get('file')
			if (!(file instanceof File) || file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error('图片大小必须在 1B 到 8MB 之间')
			const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
			const extension = types[file.type]
			if (!extension) throw new Error('只支持 PNG、JPEG、WebP 和 GIF')
			const bytes = Buffer.from(await file.arrayBuffer())
			const valid =
				extension === 'png'
					? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
					: extension === 'jpg'
						? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
						: extension === 'gif'
							? bytes.subarray(0, 3).toString() === 'GIF'
							: bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
			if (!valid) throw new Error('图片内容与格式不符')
			const filename = `${randomUUID()}.${extension}`
			await mkdir(path.join(dataDir(), 'uploads'), { recursive: true })
			await writeFile(path.join(dataDir(), 'uploads', filename), bytes)
			return json({ url: `/api/uploads/${filename}` })
		}
		if (action === 'restore-backup') {
			const input = await request.json()
			if (input.confirm !== '覆盖全部数据') throw new Error('请确认覆盖范围')
			const backup = input.backup
			if (
				(backup?.version !== 1 && backup?.version !== 2 && backup?.version !== 3) ||
				!Array.isArray(backup.sections) ||
				!Array.isArray(backup.entries) ||
				!Array.isArray(backup.settings) ||
				!backup.images ||
				typeof backup.images !== 'object'
			)
				throw new Error('备份格式无效')
			if (backup.sections.length > 1000 || backup.entries.length > 10000 || Object.keys(backup.images).length > 10000) throw new Error('备份超过限制')
			const legacyFiles = backup.version === 3 ? backup.legacyFiles : []
			const likes = backup.version === 3 ? backup.likes : []
			if (!Array.isArray(legacyFiles) || !Array.isArray(likes) || legacyFiles.length > 20000 || likes.length > 20000) throw new Error('备份内容无效')
			for (const file of legacyFiles) {
				if (typeof file.path !== 'string' || !validLegacyPath(file.path) || ![0, 1].includes(file.deleted) || (file.deleted === 0 && (typeof file.content !== 'string' || file.content.length > 16_000_000))) throw new Error('备份文件无效')
			}
			for (const like of likes) if (typeof like.slug !== 'string' || like.slug.length > 150 || !Number.isSafeInteger(like.count) || like.count < 0) throw new Error('备份点赞数据无效')
			const images = Object.entries(backup.images) as [string, string][]
			for (const [name, value] of images) {
				if (!/^[\da-f-]{36}\.(png|jpg|webp|gif)$/.test(name) || typeof value !== 'string' || value.length > 12_000_000) throw new Error('备份图片无效')
			}
			db().transaction(() => {
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
					public_section_id, public_position, previous_title, previous_summary, previous_body, previous_section_id, previous_position, published_at)
					VALUES (@id, @section_id, @title, @summary, @body, @position, @published, @public_title, @public_summary, @public_body,
					@public_section_id, @public_position, @previous_title, @previous_summary, @previous_body, @previous_section_id, @previous_position, @published_at)`)
				for (const row of backup.entries)
					insertEntry.run({
						...row,
						public_section_id: row.public_section_id ?? (row.public_title ? row.section_id : null),
						public_position: row.public_position ?? (row.public_title ? row.position : null),
						previous_section_id: row.previous_section_id ?? (row.previous_title ? row.section_id : null),
						previous_position: row.previous_position ?? (row.previous_title ? row.position : null)
					})
				const insertSetting = db().prepare('INSERT INTO settings (key, value) VALUES (@key, @value)')
				for (const row of backup.settings) insertSetting.run(row)
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
		return json({ ok: true, result: handler(input) })
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : '请求失败' }, 400)
	}
}
