import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { Agent, ProxyAgent, fetch } from 'undici'
import { rssRuntime } from './rss-runtime'

const blocked = new BlockList()
for (const [address, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const)
	blocked.addSubnet(address, prefix, 'ipv4')
// Only globally routable IPv6 unicast addresses are accepted.
const publicV6 = new BlockList()
publicV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')

export function httpUrl(value: unknown) {
	if (typeof value !== 'string' || value.length > 2000) throw new Error('URL 无效')
	let url: URL
	try {
		url = new URL(value)
	} catch {
		throw new Error('请输入完整的 HTTP 或 HTTPS URL')
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只支持不含账号密码的 HTTP 或 HTTPS URL')
	url.hash = ''
	return url
}

export function isPublicAddress(address: string) {
	const family = isIP(address)
	return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

export async function fetchLimited(
	value: string,
	maxBytes: number,
	trustedOrigin?: string,
	referer?: string,
	request?: { method: 'POST'; body: string; headers: Record<string, string> }
) {
	let url = httpUrl(value)
	const signal = AbortSignal.timeout(30_000)
	for (let redirects = 0; redirects <= 4; redirects++) {
		const trusted = url.origin === trustedOrigin
		const hostname = url.hostname.replace(/^\[|\]$/g, '')
		const addresses = await lookup(hostname, { all: true })
		if (!addresses.length || (!trusted && addresses.some(item => !isPublicAddress(item.address)))) throw new Error('不允许访问本地或内网地址')
		const proxy = trusted ? undefined : rssRuntime().fetchProxy
		const dispatcher = proxy
			? new ProxyAgent(proxy)
			: new Agent({
					connect: {
						lookup: (_host, options, callback) => {
							if (options.all) callback(null, addresses)
							else callback(null, addresses[0].address, addresses[0].family)
						}
					}
				})
		try {
			const response = await fetch(url, {
				dispatcher,
				signal,
				redirect: request ? 'error' : 'manual',
				method: request?.method,
				body: request?.body,
				headers: { 'User-Agent': 'NexusAI-RSS/1.0', ...(referer ? { Referer: referer } : {}), ...request?.headers }
			})
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				await response.body?.cancel()
				const location = response.headers.get('location')
				if (!location || redirects === 4) throw new Error('重定向次数过多或地址无效')
				url = httpUrl(new URL(location, url).href)
				continue
			}
			if (!response.ok && !request) {
				await response.body?.cancel()
				throw new Error(`抓取失败（HTTP ${response.status}），请检查订阅地址或 RSSHub 的知乎登录配置`)
			}
			if (Number(response.headers.get('content-length')) > maxBytes) {
				await response.body?.cancel()
				throw new Error('下载内容超过大小限制')
			}
			const chunks: Uint8Array[] = []
			let size = 0
			if (response.body)
				for await (const chunk of response.body) {
					size += chunk.length
					if (size > maxBytes) throw new Error('下载内容超过大小限制')
					chunks.push(chunk)
				}
			return {
				bytes: Buffer.concat(chunks),
				type: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
				status: response.status,
				headers: response.headers
			}
		} finally {
			await dispatcher.destroy()
		}
	}
	throw new Error('抓取失败')
}
