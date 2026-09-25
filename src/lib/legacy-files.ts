import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/site-db'

export type FileChange = { path: string; content?: string; delete?: boolean }

const listPaths = new Set([
	'src/app/about/list.json',
	'src/app/bloggers/list.json',
	'src/app/pictures/list.json',
	'src/app/projects/list.json',
	'src/app/share/list.json',
	'src/app/snippets/list.json',
	'src/config/site-content.json',
	'src/config/card-styles.json'
])

export function validLegacyPath(value: string) {
	if (!value || value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#') || value.split('/').some(part => !part || part === '.' || part === '..')) return false
	return value === 'public/favicon.png' || value.startsWith('public/blogs/') || value.startsWith('public/images/') || listPaths.has(value)
}

function filesDb() {
	return db()
}

export async function readLegacyFile(filePath: string) {
	if (!validLegacyPath(filePath)) throw new Error('无效文件路径')
	const row = filesDb().prepare('SELECT content, deleted FROM legacy_files WHERE path = ?').get(filePath) as { content: Buffer | null; deleted: number } | undefined
	if (row) return row.deleted ? null : row.content
	try {
		return await readFile(path.join(process.cwd(), filePath))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
		throw error
	}
}

export async function listLegacyFiles(prefix: string) {
	if (!validLegacyPath(`${prefix}/index.md`) || !prefix.startsWith('public/blogs/')) throw new Error('无效目录')
	const found = new Set<string>()
	async function visit(dir: string) {
		try {
			for (const entry of await readdir(path.join(process.cwd(), dir), { withFileTypes: true })) {
				const name = `${dir}/${entry.name}`
				if (entry.isDirectory()) await visit(name)
				else if (entry.isFile()) found.add(name)
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		}
	}
	await visit(prefix)
	const rows = filesDb().prepare("SELECT path, deleted FROM legacy_files WHERE path LIKE ? ESCAPE '\\'").all(`${prefix.replace(/[\\%_]/g, '\\$&')}/%`) as { path: string; deleted: number }[]
	for (const row of rows) row.deleted ? found.delete(row.path) : found.add(row.path)
	return [...found]
}

export function saveLegacyFiles(changes: FileChange[]) {
	if (!Array.isArray(changes) || changes.length < 1 || changes.length > 200) throw new Error('文件数量无效')
	const parsed = changes.map(change => {
		if (typeof change.path !== 'string' || !validLegacyPath(change.path)) throw new Error('无效文件路径')
		if (change.delete) return { path: change.path, content: null, deleted: 1 }
		if (typeof change.content !== 'string' || change.content.length > 16_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(change.content)) throw new Error('文件内容无效')
		return { path: change.path, content: Buffer.from(change.content, 'base64'), deleted: 0 }
	})
	if (parsed.reduce((size, item) => size + (item.content?.length || 0), 0) > 48 * 1024 * 1024) throw new Error('提交文件过大')
	const connection = filesDb()
	connection.transaction(() => {
		const query = connection.prepare('INSERT INTO legacy_files (path, content, deleted) VALUES (@path, @content, @deleted) ON CONFLICT(path) DO UPDATE SET content = excluded.content, deleted = excluded.deleted')
		for (const item of parsed) query.run(item)
	})()
}
