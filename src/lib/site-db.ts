import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import path from 'node:path'

export type Section = { id: number; name: string; kind: 'docs' | 'articles'; parent_id: number | null; position: number }
export type Entry = {
	id: number
	section_id: number
	title: string
	summary: string
	body: string
	position: number
	published: number
	public_title: string | null
	public_summary: string | null
	public_body: string | null
	public_section_id: number | null
	public_position: number | null
	previous_title: string | null
	previous_summary: string | null
	previous_body: string | null
	previous_section_id: number | null
	previous_position: number | null
	published_at: string | null
}

let connection: Database.Database | undefined

export function dataDir() {
	return process.env.DATA_DIR || path.join(process.cwd(), 'data')
}

export function db() {
	if (connection) return connection
	mkdirSync(dataDir(), { recursive: true })
	connection = new Database(path.join(dataDir(), 'site.db'))
	connection.pragma('journal_mode = WAL')
	connection.pragma('foreign_keys = ON')
	connection.exec(`
		CREATE TABLE IF NOT EXISTS sections (
			id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('docs','articles')),
			parent_id INTEGER REFERENCES sections(id), position INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS entries (
			id INTEGER PRIMARY KEY, section_id INTEGER NOT NULL REFERENCES sections(id),
			title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
			position INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0,
			public_title TEXT, public_summary TEXT, public_body TEXT,
			public_section_id INTEGER REFERENCES sections(id), public_position INTEGER,
			previous_title TEXT, previous_summary TEXT, previous_body TEXT,
			previous_section_id INTEGER REFERENCES sections(id), previous_position INTEGER,
			published_at TEXT
		);
		CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS legacy_files (path TEXT PRIMARY KEY, content BLOB, deleted INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS likes (slug TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS like_events (slug TEXT NOT NULL, visitor TEXT NOT NULL, liked_at INTEGER NOT NULL, PRIMARY KEY(slug, visitor));
	`)
	const columns = new Set((connection.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map(column => column.name))
	for (const [name, type] of [
		['public_section_id', 'INTEGER REFERENCES sections(id)'],
		['public_position', 'INTEGER'],
		['previous_section_id', 'INTEGER REFERENCES sections(id)'],
		['previous_position', 'INTEGER']
	] as const) {
		if (!columns.has(name)) connection.exec(`ALTER TABLE entries ADD COLUMN ${name} ${type}`)
	}
	connection.exec(`UPDATE entries SET public_section_id = section_id, public_position = position
		WHERE public_title IS NOT NULL AND public_section_id IS NULL`)
	connection.exec(`UPDATE entries SET previous_section_id = section_id, previous_position = position
		WHERE previous_title IS NOT NULL AND previous_section_id IS NULL`)
	const initialized = connection.prepare("SELECT value FROM meta WHERE key = 'initialized'").get()
	if (!initialized) {
		const count = (connection.prepare('SELECT COUNT(*) AS count FROM sections').get() as { count: number }).count
		if (!count) {
			const insert = connection.prepare('INSERT INTO sections (name, kind, position) VALUES (?, ?, ?)')
			for (const [index, name] of ['API 文档', '使用教程', 'AI 技术分享'].entries()) {
				insert.run(name, index === 0 ? 'docs' : 'articles', index)
			}
		}
		connection.prepare("INSERT INTO meta (key, value) VALUES ('initialized', '1')").run()
	}
	if (!connection.prepare("SELECT 1 FROM meta WHERE key = 'content_redesign_20260925'").get()) {
		const oldContent =
			(connection.prepare('SELECT COUNT(*) AS count FROM entries').get() as { count: number }).count ||
			(connection.prepare("SELECT COUNT(*) AS count FROM sections WHERE name NOT IN ('API 文档', '使用教程', 'AI 技术分享')").get() as { count: number })
				.count ||
			(
				connection
					.prepare(
						"SELECT COUNT(*) AS count FROM legacy_files WHERE path LIKE 'public/blogs/%' OR path IN ('src/app/projects/list.json', 'src/app/share/list.json', 'src/app/bloggers/list.json')"
					)
					.get() as { count: number }
			).count
		if (oldContent) {
			const backup = path.join(dataDir(), 'site-before-content-redesign.db')
			if (!existsSync(backup)) connection.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
			const uploads = path.join(dataDir(), 'uploads')
			const uploadsBackup = path.join(dataDir(), 'uploads-before-content-redesign')
			if (existsSync(uploads) && readdirSync(uploads).length && !existsSync(uploadsBackup)) {
				renameSync(uploads, uploadsBackup)
				mkdirSync(uploads)
			}
		}
		connection.transaction(() => {
			connection!.prepare('DELETE FROM entries').run()
			connection!.prepare('DELETE FROM sections').run()
			connection!
				.prepare(
					"DELETE FROM legacy_files WHERE path LIKE 'public/blogs/%' OR path IN ('src/app/projects/list.json', 'src/app/share/list.json', 'src/app/bloggers/list.json')"
				)
				.run()
			connection!.prepare('DELETE FROM likes').run()
			connection!.prepare('DELETE FROM like_events').run()
			const insert = connection!.prepare('INSERT INTO sections (name, kind, position) VALUES (?, ?, ?)')
			insert.run('API 文档', 'docs', 0)
			insert.run('使用教程', 'articles', 1)
			insert.run('AI 技术分享', 'articles', 2)
			connection!.prepare("INSERT INTO meta (key, value) VALUES ('content_redesign_20260925', '1')").run()
		})()
	}
	if (!connection.prepare("SELECT 1 FROM meta WHERE key = 'nexus_ai_tutorial_imported'").get()) {
		const tutorialSection = connection.prepare("SELECT id FROM sections WHERE name = '使用教程'").get() as { id: number } | undefined
		if (tutorialSection) {
			const body = readFileSync(path.join(process.cwd(), 'public', 'tutorials', 'nexus-ai', 'tutorial.md'), 'utf8').trim()
			connection.transaction(() => {
				const existing = connection!.prepare("SELECT 1 FROM entries WHERE section_id = ? AND title = 'Nexus AI 使用教程'").get(tutorialSection.id)
				if (!existing) {
					connection!
						.prepare(
							`INSERT INTO entries (section_id, title, summary, body, position, published,
							public_title, public_summary, public_body, public_section_id, public_position, published_at)
							VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, 0, ?)`
						)
						.run(
							tutorialSection.id,
							'Nexus AI 使用教程',
							'从创建 API 密钥到导入 CC Switch 并选择模型。',
							body,
							'Nexus AI 使用教程',
							'从创建 API 密钥到导入 CC Switch 并选择模型。',
							body,
							tutorialSection.id,
							new Date().toISOString()
						)
				}
				connection!.prepare("INSERT INTO meta (key, value) VALUES ('nexus_ai_tutorial_imported', '1')").run()
			})()
		}
	}
	if (!connection.prepare("SELECT 1 FROM meta WHERE key = 'nexus_ai_tutorial_outline_20260927'").get()) {
		const tutorial = connection.prepare("SELECT id, body, public_body FROM entries WHERE title = 'Nexus AI 使用教程' ORDER BY id LIMIT 1").get() as
			| { id: number; body: string; public_body: string | null }
			| undefined
		if (tutorial) {
			const oldBodyHash = '1937414239f296bdd7c355fd78f59fea4cbb7950c7a0b8c37ae38a5ce37171e7'
			const isOriginal = (body: string | null) => body !== null && createHash('sha256').update(body).digest('hex') === oldBodyHash
			if (isOriginal(tutorial.body) || isOriginal(tutorial.public_body)) {
				const body = readFileSync(path.join(process.cwd(), 'public', 'tutorials', 'nexus-ai', 'tutorial.md'), 'utf8').trim()
				connection
					.prepare('UPDATE entries SET body = ?, public_body = ? WHERE id = ?')
					.run(isOriginal(tutorial.body) ? body : tutorial.body, isOriginal(tutorial.public_body) ? body : tutorial.public_body, tutorial.id)
			}
		}
		connection.prepare("INSERT INTO meta (key, value) VALUES ('nexus_ai_tutorial_outline_20260927', '1')").run()
	}
	if (!connection.prepare("SELECT 1 FROM meta WHERE key = 'nexus_api_docs_imported_20260927'").get()) {
		const apiSection = connection.prepare("SELECT id FROM sections WHERE name = 'API 文档'").get() as { id: number } | undefined
		if (apiSection) {
			connection.transaction(() => {
				const existing = connection!
					.prepare('SELECT 1 FROM entries WHERE section_id = ? OR (published = 1 AND public_section_id = ?) LIMIT 1')
					.get(apiSection.id, apiSection.id)
				if (!existing) {
					const body = readFileSync(path.join(process.cwd(), 'docs', 'API docs.md'), 'utf8')
						.trim()
						.replace(/^# Nexus API 文档\r?\n+/, '')
					connection!
						.prepare(
							`INSERT INTO entries (section_id, title, summary, body, position, published,
							public_title, public_summary, public_body, public_section_id, public_position, published_at)
							VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, 0, ?)`
						)
						.run(
							apiSection.id,
							'Nexus API 文档',
							'Nexus API 的认证、模型查询与常用兼容接口接入示例。',
							body,
							'Nexus API 文档',
							'Nexus API 的认证、模型查询与常用兼容接口接入示例。',
							body,
							apiSection.id,
							new Date().toISOString()
						)
				}
				connection!.prepare("INSERT INTO meta (key, value) VALUES ('nexus_api_docs_imported_20260927', '1')").run()
			})()
		}
	}
	return connection
}

export function sections() {
	return db().prepare('SELECT * FROM sections ORDER BY position, id').all() as Section[]
}

export function entries(includeDraft = false) {
	const rows = db()
		.prepare(`SELECT * FROM entries ${includeDraft ? '' : 'WHERE published = 1'} ORDER BY position, id`)
		.all() as Entry[]
	return includeDraft
		? rows
		: rows
				.map(row => ({ ...row, section_id: row.public_section_id ?? row.section_id, position: row.public_position ?? row.position }))
				.sort((a, b) => a.position - b.position || a.id - b.id)
}

export function publicEntry(id: number) {
	const row = db().prepare('SELECT * FROM entries WHERE id = ? AND published = 1').get(id) as Entry | undefined
	return row && { ...row, section_id: row.public_section_id ?? row.section_id, position: row.public_position ?? row.position }
}

export function settings() {
	const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
	return Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, string>
}

export function resetDbForTests() {
	connection?.close()
	connection = undefined
}
