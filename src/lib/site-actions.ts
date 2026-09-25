import { db, entries, sections, settings, type Entry, type Section } from './site-db'

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
	if (!found) throw new Error('栏目不存在')
	return found
}

function entry(value: unknown) {
	const found = db().prepare('SELECT * FROM entries WHERE id = ?').get(id(value)) as Entry | undefined
	if (!found) throw new Error('文档不存在')
	return found
}

export function createSection(input: Record<string, unknown>) {
	const name = required(input.name, '栏目名称')
	const kind = input.kind
	if (kind !== 'docs' && kind !== 'articles') throw new Error('栏目类型无效')
	const parent = input.parent_id == null ? null : section(input.parent_id)
	if (parent && (kind !== 'docs' || parent.kind !== 'docs' || parent.parent_id !== null)) throw new Error('只允许文档栏目有一级分组')
	const max = db()
		.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM sections WHERE parent_id IS ?')
		.get(parent?.id ?? null) as { next: number }
	return db()
		.prepare('INSERT INTO sections (name, kind, parent_id, position) VALUES (?, ?, ?, ?)')
		.run(name, kind, parent?.id ?? null, max.next).lastInsertRowid
}

export function updateSection(input: Record<string, unknown>) {
	const current = section(input.id)
	const name = required(input.name, '栏目名称')
	const parent = input.parent_id == null ? null : section(input.parent_id)
	if (parent && (current.kind !== 'docs' || parent.kind !== 'docs' || parent.parent_id !== null || parent.id === current.id)) throw new Error('分组层级无效')
	if (parent && (db().prepare('SELECT COUNT(*) AS count FROM sections WHERE parent_id = ?').get(current.id) as { count: number }).count)
		throw new Error('含有子栏目，不能移动到分组下')
	db()
		.prepare('UPDATE sections SET name = ?, parent_id = ?, position = ? WHERE id = ?')
		.run(name, parent?.id ?? null, position(input.position), current.id)
}

export function deleteSection(input: Record<string, unknown>) {
	const current = section(input.id)
	const children = db().prepare('SELECT COUNT(*) AS count FROM sections WHERE parent_id = ?').get(current.id) as { count: number }
	const docs = db()
		.prepare('SELECT COUNT(*) AS count FROM entries WHERE section_id = ? OR public_section_id = ? OR previous_section_id = ?')
		.get(current.id, current.id, current.id) as { count: number }
	if (children.count || docs.count) throw new Error('请先处理栏目中的子栏目和内容')
	db().prepare('DELETE FROM sections WHERE id = ?').run(current.id)
}

export function createEntry(input: Record<string, unknown>) {
	const target = section(input.section_id)
	const title = required(input.title, '标题')
	const max = db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM entries WHERE section_id = ?').get(target.id) as { next: number }
	return db().prepare('INSERT INTO entries (section_id, title, position) VALUES (?, ?, ?)').run(target.id, title, max.next).lastInsertRowid
}

export function saveEntry(input: Record<string, unknown>) {
	const current = entry(input.id)
	const target = section(input.section_id)
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
	const keys = ['name', 'logo', 'intro', 'consoleUrl', 'apiKeyUrl'] as const
	const values = keys.map(key => {
		const value = optional(input[key], key, key === 'intro' ? 2000 : 500)
		if (
			(key === 'consoleUrl' || key === 'apiKeyUrl' || key === 'logo') &&
			value &&
			!/^https?:\/\//.test(value) &&
			!(key === 'logo' && value.startsWith('/api/uploads/'))
		)
			throw new Error(`${key} 必须是 HTTP(S) 地址`)
		if (key === 'name' && !value) throw new Error('网站名称不能为空')
		return [key, value] as const
	})
	db().transaction(() => {
		const statement = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		for (const [key, value] of values) statement.run(key, value)
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
	return { sections: sections(), entries: entries(true), settings: settings() }
}
