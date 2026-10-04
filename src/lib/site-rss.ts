import Parser from 'rss-parser'
import { load } from 'cheerio'
import { db, sections, type Entry } from './site-db'
import { createEntry, saveEntry } from './site-actions'
import { articleMarkdown, sourceNote } from './rss-markdown'
import { fetchLimited, httpUrl } from './rss-network'
import { localizeImages } from './site-images'
import { nextRssRuntime, publicRssRuntime, rssRuntime, writeRssRuntime } from './rss-runtime'

export type RssSubscription = { id: number; name: string; url: string; refreshed_at: string | null; error: string }
export type RssItem = {
	id: number
	subscription_id: number
	title: string
	link: string
	author: string
	published_at: string | null
	summary: string
	entry_id: number | null
	published: number | null
}
type StoredItem = Omit<RssItem, 'summary' | 'entry_id' | 'published'> & { html: string }

const parser = new Parser({ maxRedirects: 0 })

function id(value: unknown) {
	if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('ID 无效')
	return Number(value)
}

export function rsshubUrl() {
	const row = db().prepare("SELECT value FROM settings WHERE key = 'rsshub_url'").get() as { value: string } | undefined
	return httpUrl(row?.value || process.env.RSSHUB_URL || 'http://127.0.0.1:1200').href.replace(/\/$/, '')
}

export function subscriptionUrl(value: unknown) {
	if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('订阅地址无效')
	const text = value.trim()
	if (text.startsWith('/') && !text.startsWith('//')) {
		if (new URL(text, 'https://rsshub.invalid').origin !== 'https://rsshub.invalid') throw new Error('RSSHub 路由无效')
		return text
	}
	const url = httpUrl(text)
	if (url.hostname === 'www.zhihu.com' || url.hostname === 'zhihu.com') {
		const author = url.pathname.match(/^\/(people|org)\/([^/]+)(?:\/posts)?\/?$/)
		if (author) return `/zhihu/posts/${author[1]}/${author[2]}`
		const column = url.pathname.match(/^\/column\/([^/]+)\/?$/)
		if (column) return `/zhihu/zhuanlan/${column[1]}`
		throw new Error('请输入知乎作者主页、专栏主页或 RSSHub 路由，文章链接不能用作订阅')
	}
	if (url.hostname === 'zhuanlan.zhihu.com') {
		const column = url.pathname.match(/^\/([^/]+)\/?$/)
		if (column && column[1] !== 'p') return `/zhihu/zhuanlan/${column[1]}`
		throw new Error('请输入知乎专栏主页，文章链接不能用作订阅')
	}
	return url.href
}

export function rssData(subscriptionId?: unknown) {
	const subscriptions = db().prepare('SELECT * FROM rss_subscriptions ORDER BY id').all() as RssSubscription[]
	const requested = subscriptionId === undefined ? undefined : id(subscriptionId)
	const selected = subscriptions.some(row => row.id === requested) ? requested : subscriptions[0]?.id
	const rows = selected
		? (db()
				.prepare(
					`SELECT r.*, e.id AS entry_id, e.published FROM rss_items r
		LEFT JOIN entries e ON e.source_url = r.link WHERE r.subscription_id = ? ORDER BY r.published_at DESC, r.id DESC`
				)
				.all(selected) as (StoredItem & { entry_id: number | null; published: number | null })[])
		: []
	return {
		rsshubUrl: rsshubUrl(),
		configuration: publicRssRuntime(),
		subscriptions,
		items: rows.map(({ html, ...item }) => ({ ...item, summary: load(html).text().replace(/\s+/g, ' ').trim().slice(0, 180) }))
	}
}

export function saveRsshub(input: Record<string, unknown>) {
	const url = httpUrl(input.url)
	if (url.search || url.hash) throw new Error('RSSHub 服务地址不能包含查询参数')
	db()
		.prepare("INSERT INTO settings (key, value) VALUES ('rsshub_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
		.run(url.href.replace(/\/$/, ''))
}

async function runtimeStatus(url: URL) {
	try {
		const response = await fetchLimited(`${url.href.replace(/\/$/, '')}/__nexus/rsshub-status`, 8192, url.origin)
		const status = JSON.parse(response.bytes.toString('utf8'))
		if (status.protocol !== 'nexus-rsshub-1' || typeof status.ready !== 'boolean' || (status.revision !== null && typeof status.revision !== 'string'))
			return null
		return { revision: status.revision as string | null, ready: status.ready, error: typeof status.error === 'string' ? status.error : '' }
	} catch {
		return null
	}
}

export async function checkRsshub(input: Record<string, unknown>) {
	const url = httpUrl(input.url ?? rsshubUrl())
	const status = await runtimeStatus(url)
	if (status) {
		const applied = status.ready && status.revision === rssRuntime().revision
		return { managed: true, applied, message: applied ? 'RSSHub 连接正常，当前配置已加载。' : 'RSSHub 已连接，正在加载配置，请稍后检查。' }
	}
	try {
		await fetchLimited(`${url.href.replace(/\/$/, '')}/healthz`, 8192, url.origin)
		return { managed: false, applied: false, message: 'RSSHub 可连接，但未接入后台配置；请使用随站点部署的配套服务。' }
	} catch {
		return { managed: false, applied: false, message: '无法连接 RSSHub，请检查服务地址和运行状态。' }
	}
}

export async function saveRssSettings(input: Record<string, unknown>) {
	const url = httpUrl(input.url)
	if (url.search || new URL(String(input.url)).hash) throw new Error('RSSHub 服务地址不能包含查询参数或片段')
	const previous = rssRuntime()
	const candidate = nextRssRuntime(input)
	if ((candidate.zhihuCookies !== previous.zhihuCookies || candidate.rsshubProxy !== previous.rsshubProxy) && !(await runtimeStatus(url)))
		throw new Error('该 RSSHub 未接入后台配置，不能修改它的 Cookie 或抓取代理；请先使用配套服务')
	const next = nextRssRuntime(input)
	writeRssRuntime(next)
	saveRsshub({ url: url.href })
	let managed = false
	let applied = false
	const deadline = Date.now() + 10_000
	do {
		const status = await runtimeStatus(url)
		managed = Boolean(status)
		applied = Boolean(status?.ready && status.revision === next.revision)
		if (!managed || applied) break
		await new Promise(resolve => setTimeout(resolve, 500))
	} while (Date.now() < deadline)
	return {
		configuration: publicRssRuntime(),
		managed,
		applied,
		message: applied
			? '抓取配置已保存并生效，可刷新订阅验证 Cookie。'
			: managed
				? '配置已保存，RSSHub 正在重新加载；稍后可检查连接。'
				: '网站配置已保存；当前 RSSHub 未接入配置同步。'
	}
}

export function saveSubscription(input: Record<string, unknown>) {
	if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160) throw new Error('订阅名称无效')
	const name = input.name.trim()
	const url = subscriptionUrl(input.url)
	const existing = db()
		.prepare('SELECT id FROM rss_subscriptions WHERE url = ? AND id != ?')
		.get(url, input.id ? id(input.id) : -1)
	if (existing) throw new Error('该订阅已存在')
	if (input.id !== undefined) {
		const current = subscription(input.id)
		db().transaction(() => {
			if (current.url !== url) db().prepare('DELETE FROM rss_items WHERE subscription_id = ?').run(current.id)
			db()
				.prepare('UPDATE rss_subscriptions SET name = ?, url = ?, error = ?, refreshed_at = ? WHERE id = ?')
				.run(name, url, current.url === url ? current.error : '', current.url === url ? current.refreshed_at : null, current.id)
		})()
		return current.id
	}
	return Number(db().prepare('INSERT INTO rss_subscriptions (name, url) VALUES (?, ?)').run(name, url).lastInsertRowid)
}

function subscription(value: unknown) {
	const row = db().prepare('SELECT * FROM rss_subscriptions WHERE id = ?').get(id(value)) as RssSubscription | undefined
	if (!row) throw new Error('订阅不存在')
	return row
}

export function deleteSubscription(input: Record<string, unknown>) {
	db().prepare('DELETE FROM rss_subscriptions WHERE id = ?').run(subscription(input.id).id)
}

export async function parseFeed(xml: string, base: string) {
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('订阅不能包含 DTD 或实体声明')
	const feed = await parser.parseString(xml)
	if (!Array.isArray(feed.items)) throw new Error('不是有效的 RSS 或 Atom 订阅')
	const items: Omit<StoredItem, 'id' | 'subscription_id'>[] = []
	for (const item of feed.items.slice(0, 100)) {
		if (!item.title?.trim() || !item.link) continue
		let link: string
		try {
			link = httpUrl(new URL(item.link, base).href).href
		} catch {
			continue
		}
		const html = item['content:encoded'] || item.content || item.summary || ''
		if (html.length > 1_000_000) throw new Error('单篇文章内容超过限制')
		const date = item.isoDate || item.pubDate
		const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null
		items.push({
			title: load(item.title).text().trim().slice(0, 160),
			link,
			html,
			author: (item.creator || item.author || '').slice(0, 160),
			published_at: publishedAt
		})
	}
	return items
}

export async function refreshSubscription(input: Record<string, unknown>) {
	const current = subscription(input.id)
	const base = rsshubUrl()
	const url = current.url.startsWith('/') ? `${base}${current.url}` : current.url
	try {
		const result = await fetchLimited(url, 5 * 1024 * 1024, new URL(base).origin)
		const items = await parseFeed(result.bytes.toString('utf8'), url)
		db().transaction(() => {
			const latest = subscription(current.id)
			if (latest.url !== current.url) throw new Error('订阅地址已修改，请重新刷新')
			const insert = db().prepare(`INSERT INTO rss_items (subscription_id, title, link, author, published_at, html) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(subscription_id, link) DO UPDATE SET title = excluded.title, author = excluded.author, published_at = excluded.published_at, html = excluded.html`)
			for (const item of items) insert.run(current.id, item.title, item.link, item.author, item.published_at, item.html)
			db().prepare("UPDATE rss_subscriptions SET refreshed_at = ?, error = '' WHERE id = ?").run(new Date().toISOString(), current.id)
		})()
		return { count: items.length }
	} catch (error) {
		const message = error instanceof Error ? error.message : '订阅刷新失败'
		db().prepare('UPDATE rss_subscriptions SET error = ? WHERE id = ?').run(message, current.id)
		throw new Error(message)
	}
}

export function previewRssItem(input: Record<string, unknown>) {
	const item = rssItem(input.id)
	return { body: sourceNote(item.link, item.author, item.published_at) + articleMarkdown(item.html, item.link) }
}

function rssItem(value: unknown) {
	const item = db().prepare('SELECT * FROM rss_items WHERE id = ?').get(id(value)) as StoredItem | undefined
	if (!item) throw new Error('候选文章不存在')
	return item
}

export async function importRssItem(input: Record<string, unknown>) {
	const item = rssItem(input.id)
	const findImported = () => db().prepare('SELECT id FROM entries WHERE source_url = ?').get(item.link) as { id: number } | undefined
	const existing = findImported()
	if (existing) return { id: existing.id, warnings: [], existing: true }
	const markdown = articleMarkdown(item.html, item.link)
	if (!markdown.trim()) throw new Error('订阅未提供正文，请检查 RSSHub 路由；不能导入空文章')
	const converted = await localizeImages(markdown, item.link)
	const body = sourceNote(item.link, item.author, item.published_at) + converted.body
	if (body.length > 1_000_000) throw new Error('转换后的正文超过限制')
	return db().transaction(() => {
		const found = findImported()
		if (found) return { id: found.id, warnings: [], existing: true }
		const target = sections().find(section => section.name === 'AI 技术分享')
		if (!target) throw new Error('AI 技术分享栏目不存在')
		const entryId = Number(createEntry({ section_id: target.id, title: item.title }))
		const entry = db().prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Entry
		const summary = load(item.html).text().replace(/\s+/g, ' ').trim().slice(0, 180)
		saveEntry({ id: entryId, section_id: target.id, title: item.title, summary, body, position: entry.position })
		db().prepare('UPDATE entries SET source_url = ? WHERE id = ?').run(item.link, entryId)
		return { id: entryId, warnings: converted.warnings, existing: false }
	})()
}

export function validateRssBackup(subscriptions: RssSubscription[], items: StoredItem[]) {
	if (!Array.isArray(subscriptions) || !Array.isArray(items) || subscriptions.length > 1000 || items.length > 10000) throw new Error('备份订阅无效')
	const ids = new Set<number>()
	const urls = new Set<string>()
	for (const row of subscriptions) {
		id(row.id)
		if (
			ids.has(row.id) ||
			typeof row.name !== 'string' ||
			!row.name.trim() ||
			row.name.length > 160 ||
			subscriptionUrl(row.url) !== row.url ||
			urls.has(row.url) ||
			typeof row.error !== 'string' ||
			row.error.length > 5000 ||
			(row.refreshed_at !== null && !Number.isFinite(Date.parse(row.refreshed_at)))
		)
			throw new Error('备份订阅无效')
		ids.add(row.id)
		urls.add(row.url)
	}
	const itemIds = new Set<number>()
	const links = new Set<string>()
	for (const row of items) {
		id(row.id)
		const key = `${row.subscription_id}:${row.link}`
		if (
			itemIds.has(row.id) ||
			links.has(key) ||
			!ids.has(row.subscription_id) ||
			typeof row.title !== 'string' ||
			!row.title.trim() ||
			row.title.length > 160 ||
			httpUrl(row.link).href !== row.link ||
			typeof row.html !== 'string' ||
			row.html.length > 1_000_000 ||
			typeof row.author !== 'string' ||
			row.author.length > 160 ||
			(row.published_at !== null && !Number.isFinite(Date.parse(row.published_at)))
		)
			throw new Error('备份候选文章无效')
		itemIds.add(row.id)
		links.add(key)
	}
}
