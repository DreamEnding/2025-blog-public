import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataDir } from './site-db'

export type RssRuntime = { revision: string | null; savedAt: string | null; zhihuCookies: string; rsshubProxy: string; fetchProxy: string; loginKey: string }
export type PublicRssRuntime = {
	cookieConfigured: boolean
	rsshubProxyConfigured: boolean
	fetchProxyConfigured: boolean
	rsshubProxySummary: string
	fetchProxySummary: string
	savedAt: string | null
}

export function runtimeFile() {
	return process.env.RSSHUB_RUNTIME_FILE || path.join(dataDir(), 'rsshub', 'runtime.json')
}

export function rssRuntime(): RssRuntime {
	let saved: Partial<RssRuntime> = {}
	if (existsSync(/* turbopackIgnore: true */ runtimeFile())) {
		try {
			saved = JSON.parse(readFileSync(/* turbopackIgnore: true */ runtimeFile(), 'utf8'))
			if (!saved || typeof saved !== 'object' || ['zhihuCookies', 'rsshubProxy', 'fetchProxy'].some(key => typeof saved[key as keyof RssRuntime] !== 'string'))
				throw new Error()
		} catch {
			throw new Error('RSS 抓取配置文件无效，请检查私有配置目录')
		}
	}
	return {
		revision: saved.revision || null,
		savedAt: saved.savedAt || null,
		zhihuCookies: saved.zhihuCookies ?? process.env.ZHIHU_COOKIES ?? '',
		rsshubProxy: saved.rsshubProxy ?? process.env.RSSHUB_PROXY_URI ?? '',
		fetchProxy: saved.fetchProxy ?? process.env.RSS_FETCH_PROXY ?? '',
		loginKey: typeof saved.loginKey === 'string' ? saved.loginKey : ''
	}
}

function proxySummary(value: string) {
	if (!value) return ''
	try {
		const url = new URL(value)
		return `${url.protocol}//${url.username || url.password ? '***@' : ''}${url.host}`
	} catch {
		return '已配置'
	}
}

export function publicRssRuntime(): PublicRssRuntime {
	const current = rssRuntime()
	return {
		cookieConfigured: Boolean(current.zhihuCookies),
		rsshubProxyConfigured: Boolean(current.rsshubProxy),
		fetchProxyConfigured: Boolean(current.fetchProxy),
		rsshubProxySummary: proxySummary(current.rsshubProxy),
		fetchProxySummary: proxySummary(current.fetchProxy),
		savedAt: current.savedAt
	}
}

export function nextRssRuntime(input: Record<string, unknown>): RssRuntime {
	const current = rssRuntime()
	const next = { ...current, revision: randomUUID(), savedAt: new Date().toISOString() }
	for (const [key, clearKey, label, max] of [
		['zhihuCookies', 'clearCookie', '知乎 Cookie', 32000],
		['rsshubProxy', 'clearRsshubProxy', 'RSSHub 代理', 2000],
		['fetchProxy', 'clearFetchProxy', '网站下载代理', 2000]
	] as const) {
		const value = input[key] ?? ''
		const clear = input[clearKey] ?? false
		if (typeof value !== 'string' || value.length > max || /[\r\n\0]/.test(value) || typeof clear !== 'boolean') throw new Error(`${label}无效`)
		if (clear && value.trim()) throw new Error(`${label}不能同时填写和清空`)
		if (clear) next[key] = ''
		else if (value.trim()) {
			if (key === 'zhihuCookies') {
				next[key] = value.trim().replace(/^cookie:\s*/i, '')
				if (!next[key] || !next[key].includes('=')) throw new Error('知乎 Cookie 格式无效，请粘贴完整的 Cookie 请求头内容')
			} else {
				let url: URL
				try {
					url = new URL(value.trim())
				} catch {
					throw new Error(`${label}地址无效`)
				}
				if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.port === '0' || url.search || url.hash || url.pathname !== '/')
					throw new Error(`${label}只支持 HTTP/HTTPS 代理地址，不能包含路径或查询参数`)
				next[key] = url.href.replace(/\/$/, '')
			}
		}
	}
	return next
}

export function writeRssRuntime(value: RssRuntime) {
	const file = runtimeFile()
	mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
	const temporary = `${file}.${randomUUID()}.tmp`
	writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
	renameSync(temporary, file)
}
