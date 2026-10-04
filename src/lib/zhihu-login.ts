import { randomBytes } from 'node:crypto'
import { signLoginRequest, verifyLoginResponse } from '../../rsshub/login-protocol.mjs'
import { nextRssRuntime, rssRuntime, writeRssRuntime } from './rss-runtime'
import { fetchLimited } from './rss-network'
import { rsshubUrl, saveRssSettings } from './site-rss'

export type ZhihuLoginSession = { id: string; state: 'pending' | 'authenticated'; expiresAt: string; width: number; height: number }

async function request(action: string, input: Record<string, unknown>, owner: string) {
	if (!owner || owner.length > 160) throw new Error('登录会话无效')
	let config = rssRuntime()
	if (action === 'start' && !config.loginKey) {
		writeRssRuntime({ ...nextRssRuntime({}), loginKey: randomBytes(32).toString('hex') })
		config = rssRuntime()
	}
	if (!config.loginKey) throw new Error('请先启动知乎扫码登录')
	const pathname = `/__nexus/zhihu-login/${action}`
	const body = JSON.stringify({ ...input, owner })
	const token = signLoginRequest(config.loginKey, 'POST', pathname, body)
	const base = rsshubUrl()
	let result
	try {
		result = await fetchLimited(`${base}${pathname}`, 4 * 1024 * 1024, new URL(base).origin, undefined, {
			method: 'POST',
			body,
			headers: { 'Content-Type': 'application/json', 'X-Nexus-Login-Authorization': token }
		})
	} catch {
		throw new Error('无法连接知乎登录服务，请检查 RSSHub 连接')
	}
	if (!verifyLoginResponse(config.loginKey, token, result.status, result.bytes, result.headers.get('x-nexus-login-response')))
		throw new Error('当前 RSSHub 未接入安全扫码登录，请使用更新后的配套服务')
	if (result.status >= 400) {
		let message = '知乎登录操作失败'
		try {
			message = JSON.parse(result.bytes.toString('utf8')).error || message
		} catch {}
		throw new Error(message)
	}
	return result
}

export async function zhihuLoginAction(action: 'start' | 'status' | 'pointer' | 'cancel' | 'complete', input: Record<string, unknown>, owner: string) {
	if (action === 'complete') {
		const result = await request('capture', input, owner)
		const cookie = JSON.parse(result.bytes.toString('utf8')).cookie
		if (typeof cookie !== 'string' || !/(?:^|;\s*)z_c0=.+/.test(cookie)) throw new Error('知乎登录凭据无效，请重新扫码')
		const saved = await saveRssSettings({ url: rsshubUrl(), zhihuCookies: cookie })
		await request('cancel', input, owner).catch(() => {})
		return { ...saved, message: saved.applied ? '知乎登录凭据已自动保存并生效，可刷新订阅。' : '知乎登录凭据已保存，RSSHub 正在加载。' }
	}
	const result = await request(action, input, owner)
	return JSON.parse(result.bytes.toString('utf8'))
}

export async function zhihuLoginFrame(id: string, owner: string) {
	const result = await request('frame', { id }, owner)
	if (result.type !== 'image/png') throw new Error('登录画面暂不可用')
	return result.bytes
}
