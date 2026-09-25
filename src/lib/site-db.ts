import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
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
			for (const [index, name] of ['API 文档', '使用教程', '模型选择', 'AI 技术分享', '求职面经'].entries()) {
				insert.run(name, index < 3 ? 'docs' : 'articles', index)
			}
		}
		connection.prepare("INSERT INTO meta (key, value) VALUES ('initialized', '1')").run()
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
