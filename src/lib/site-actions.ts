import { db, entries, sections, type Entry, type Section } from './site-db'
import { siteConfig, siteSettings } from './site-config'

function required(value: unknown, label: string, max = 160) {
	if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}无效`)
	return value.trim()
}

function optional(value: unknown, label: string, max: number) {
	if (typeof value !== 'string' || value.length > max) throw new Error(`${label}无效`)
	return value.trim()
}

function id(value: unknown) {
	if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('ID 无效')
	return Number(value)
}

function position(value: unknown) {
	if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('排序值无效')
	return Number(value)
}

function section(value: unknown) {
	const found = db().prepare('SELECT * FROM sections WHERE id = ?').get(id(value)) as Section | undefined
	if (!found || !['API 文档', '使用教程', 'AI 技术分享'].includes(found.name)) throw new Error('栏目不存在')
	return found
}

function checkEntryLimit(target: Section, currentId?: number) {
	if (target.name !== 'API 文档' && target.name !== '使用教程') return
	const existing = db()
		.prepare('SELECT id FROM entries WHERE (section_id = ? OR (published = 1 AND public_section_id = ?)) AND id != ? LIMIT 1')
		.get(target.id, target.id, currentId ?? -1)
	if (existing) throw new Error(`${target.name}最多保留一篇`)
}

function entry(value: unknown) {
	const found = db().prepare('SELECT * FROM entries WHERE id = ?').get(id(value)) as Entry | undefined
	if (!found) throw new Error('文档不存在')
	return found
}

export function createSection() {
	throw new Error('栏目固定，不能创建')
}

export function updateSection() {
	throw new Error('栏目固定，不能修改')
}

export function deleteSection() {
	throw new Error('栏目固定，不能删除')
}

export function createEntry(input: Record<string, unknown>) {
	const target = section(input.section_id)
	checkEntryLimit(target)
	const title = required(input.title, '标题')
	const max = db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM entries WHERE section_id = ?').get(target.id) as { next: number }
	return db().prepare('INSERT INTO entries (section_id, title, position) VALUES (?, ?, ?)').run(target.id, title, max.next).lastInsertRowid
}

export function saveEntry(input: Record<string, unknown>) {
	const current = entry(input.id)
	const target = section(input.section_id)
	checkEntryLimit(target, current.id)
	db()
		.prepare('UPDATE entries SET section_id = ?, title = ?, summary = ?, body = ?, position = ? WHERE id = ?')
		.run(
			target.id,
			required(input.title, '标题'),
			optional(input.summary, '摘要', 1000),
			optional(input.body, '正文', 1_000_000),
			position(input.position),
			current.id
		)
}

export function publishEntry(input: Record<string, unknown>) {
	const current = entry(input.id)
	if (!current.title.trim() || !current.body.trim()) throw new Error('标题和正文不能为空')
	checkEntryLimit(section(current.section_id), current.id)
	db()
		.prepare(
			`UPDATE entries SET previous_title = public_title, previous_summary = public_summary, previous_body = public_body,
		previous_section_id = public_section_id, previous_position = public_position,
		public_title = title, public_summary = summary, public_body = body, public_section_id = section_id, public_position = position,
		published = 1, published_at = ? WHERE id = ?`
		)
		.run(new Date().toISOString(), current.id)
}

export function withdrawEntry(input: Record<string, unknown>) {
	db().prepare('UPDATE entries SET published = 0 WHERE id = ?').run(entry(input.id).id)
}

export function restoreEntry(input: Record<string, unknown>) {
	const current = entry(input.id)
	if (!current.previous_title || current.previous_body == null) throw new Error('没有可恢复的上一次发布版本')
	checkEntryLimit(section(current.previous_section_id), current.id)
	db()
		.prepare(
			`UPDATE entries SET title = previous_title, summary = previous_summary, body = previous_body, section_id = previous_section_id, position = previous_position,
		public_title = previous_title, public_summary = previous_summary, public_body = previous_body, public_section_id = previous_section_id, public_position = previous_position,
		previous_title = ?, previous_summary = ?, previous_body = ?, previous_section_id = ?, previous_position = ?,
		published = 1, published_at = ? WHERE id = ?`
		)
		.run(
			current.public_title,
			current.public_summary,
			current.public_body,
			current.public_section_id,
			current.public_position,
			new Date().toISOString(),
			current.id
		)
}

export function deleteEntry(input: Record<string, unknown>) {
	db().prepare('DELETE FROM entries WHERE id = ?').run(entry(input.id).id)
}

export function saveSettings(input: Record<string, unknown>) {
	const current = siteSettings()
	const keys = ['name', 'username', 'logo', 'intro', 'consoleUrl', 'apiKeyUrl', 'githubUrl', 'email', 'juejinUrl', 'analyticsId'] as const
	const values = keys.map(key => {
		const value = optional(input[key] ?? current[key], key, key === 'intro' ? 2000 : 500)
		if (
			['consoleUrl', 'apiKeyUrl', 'logo', 'githubUrl', 'juejinUrl'].includes(key) &&
			value &&
			!/^https?:\/\//.test(value) &&
			!(key === 'logo' && /^\/(?:api\/uploads|images)\//.test(value))
		)
			throw new Error(`${key} 必须是 HTTP(S) 地址`)
		if (key === 'name' && !value) throw new Error('网站名称不能为空')
		if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('联系邮箱无效')
		if (key === 'analyticsId' && value && !/^G-[A-Z0-9]+$/.test(value)) throw new Error('统计 ID 无效')
		return [key, value] as const
	})
	const updated = Object.fromEntries(values)
	const config = siteConfig()
	config.meta = { title: updated.name, username: updated.username, description: updated.intro }
	config.logo = updated.logo || '/images/avatar.png'
	config.analyticsId = updated.analyticsId
	for (const [type, key] of [
		['github', 'githubUrl'],
		['email', 'email'],
		['juejin', 'juejinUrl']
	] as const) {
		const existing = config.socialButtons.find(button => button.type === type)
		config.socialButtons = config.socialButtons.filter(button => button.type !== type)
		if (updated[key])
			config.socialButtons.push({
				id: existing?.id || type,
				type,
				value: updated[key],
				label: existing?.label || type,
				order: existing?.order ?? config.socialButtons.length + 1
			})
	}
	db().transaction(() => {
		const statement = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		for (const key of ['consoleUrl', 'apiKeyUrl']) statement.run(key, updated[key])
		db().prepare("DELETE FROM settings WHERE key IN ('name', 'logo', 'intro')").run()
		db()
			.prepare('INSERT INTO legacy_files (path, content, deleted) VALUES (?, ?, 0) ON CONFLICT(path) DO UPDATE SET content = excluded.content, deleted = 0')
			.run('src/config/site-content.json', Buffer.from(JSON.stringify(config)))
	})()
}

export function publicSearch(query: string) {
	const term = query.trim().slice(0, 100).toLowerCase()
	if (!term) return []
	return entries()
		.filter(item => `${item.public_title} ${item.public_summary} ${item.public_body}`.toLowerCase().includes(term))
		.map(item => {
			const body = item.public_body || ''
			const index = body.toLowerCase().indexOf(term)
			return {
				id: item.id,
				title: item.public_title,
				section_id: item.section_id,
				snippet: index < 0 ? item.public_summary : `…${body.slice(Math.max(0, index - 45), index + term.length + 70)}…`
			}
		})
}

export function adminData() {
	return { sections: sections(), entries: entries(true), settings: siteSettings() }
}
