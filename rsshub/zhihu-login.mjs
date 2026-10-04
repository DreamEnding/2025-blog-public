import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { ensureLoginFont } from './login-font.mjs'

const origin = 'https://www.zhihu.com'
const width = 960
const height = 720
const lifetime = 10 * 60 * 1000

function zhihuDomain(host) {
	return host === 'zhihu.com' || host.endsWith('.zhihu.com')
}
export function allowedLoginUrl(value) {
	try {
		const url = new URL(value)
		return (
			url.protocol === 'https:' &&
			['zhihu.com', 'zhimg.com', 'qq.com', 'gtimg.com', 'qcloud.com', 'qcloudcdn.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
		)
	} catch {
		return false
	}
}
export function zhihuCookieHeader(cookies, now = Date.now()) {
	const valid = cookies.filter(
		cookie =>
			zhihuDomain(cookie.domain.toLowerCase().replace(/^\./, '')) &&
			(cookie.expires < 0 || cookie.expires * 1000 > now) &&
			/^[!#$%&'*+\-.^_\x60|~\w]+$/.test(cookie.name) &&
			!/[\r\n;\0]/.test(cookie.value)
	)
	if (!valid.some(cookie => cookie.name === 'z_c0' && cookie.value)) return null
	const header = valid.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
	if (header.length > 32000) throw new Error('知乎登录凭据超过长度限制')
	return header
}
export async function launchLoginBrowser(proxy) {
	await ensureLoginFont(proxy).catch(() => {})
	const require = createRequire('/app/package.json')
	let chromium
	try {
		chromium = require('patchright').chromium
	} catch {
		throw new Error('登录浏览器未安装，请使用配套的 Chromium 镜像')
	}
	const env = await readFile('/app/.env', 'utf8').catch(() => '')
	const executablePath = env.match(/^CHROMIUM_EXECUTABLE_PATH=(.+)$/m)?.[1]?.trim()
	const options = { headless: true, timeout: 15000, ...(executablePath ? { executablePath } : {}) }
	if (proxy) {
		const url = new URL(proxy)
		if (url.protocol === 'https:' && (url.username || url.password)) throw new Error('扫码登录不支持带密码的 HTTPS 代理，请使用 HTTP 代理')
		options.proxy = { server: `${url.protocol}//${url.host}`, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
	}
	try {
		return await chromium.launch(options)
	} catch {
		throw new Error('无法启动登录浏览器，请检查 Chromium 镜像及服务状态')
	}
}

export function createZhihuLogin({ launch = launchLoginBrowser, clock = Date.now } = {}) {
	let active = null
	let opening = false
	async function close() {
		const previous = active
		active = null
		if (previous) {
			clearTimeout(previous.timer)
			await previous.browser.close().catch(() => {})
		}
	}
	async function session(owner, id) {
		if (!active || active.owner !== owner || active.id !== id) throw new Error('登录会话不存在或不属于当前管理员')
		if (active.expires <= clock()) {
			await close()
			throw new Error('登录会话已过期，请重新扫码')
		}
		return active
	}
	async function cookie(current) {
		return zhihuCookieHeader(await current.context.cookies(origin), clock())
	}
	return {
		async start(owner, proxy) {
			if (active?.expires <= clock()) await close()
			if (active || opening) throw new Error('已有知乎登录进行中，请完成或取消后再试')
			opening = true
			let browser
			try {
				browser = await launch(proxy)
				const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', serviceWorkers: 'block' })
				const page = await context.newPage()
				await context.route('**/*', async route => {
					const request = route.request()
					let main = false
					try {
						main = request.isNavigationRequest() && request.frame() === page.mainFrame()
					} catch {}
					const url = request.url()
					if (!allowedLoginUrl(url) || (main && !zhihuDomain(new URL(url).hostname))) await route.abort()
					else await route.continue()
				})
				const current = { browser, context, page, owner, id: randomBytes(24).toString('hex'), expires: clock() + lifetime, timer: null, error: '' }
				current.timer = setTimeout(() => {
					if (active === current) void close()
				}, lifetime)
				current.timer.unref?.()
				active = current
				void page
					.goto(`${origin}/signin`, { waitUntil: 'domcontentloaded', timeout: 30000 })
					.then(response => {
						if (response && response.status() >= 400) current.error = `知乎登录页返回 HTTP ${response.status()}，请检查代理后重新扫码`
					})
					.catch(() => {
						current.error = '知乎登录页面无法打开，请检查代理后重新扫码'
					})
				return { id: current.id, state: 'pending', expiresAt: new Date(current.expires).toISOString(), width, height }
			} catch (cause) {
				await browser?.close().catch(() => {})
				if (cause.message.startsWith('知乎') || cause.message.startsWith('无法启动') || cause.message.startsWith('登录浏览器')) throw cause
				throw new Error('知乎登录页面无法打开，请检查代理及网络后重试')
			} finally {
				opening = false
			}
		},
		async status(owner, id) {
			const current = await session(owner, id)
			if (current.error) throw new Error(current.error)
			return { id, state: (await cookie(current)) ? 'authenticated' : 'pending', expiresAt: new Date(current.expires).toISOString(), width, height }
		},
		async frame(owner, id) {
			const current = await session(owner, id)
			if (current.error) throw new Error(current.error)
			if (await cookie(current)) throw new Error('登录已完成，正在保存凭据')
			return current.page.screenshot({ type: 'png', timeout: 10000 })
		},
		async pointer(owner, id, input) {
			const current = await session(owner, id)
			if (input.kind === 'drag') {
				const points = input.points
				if (
					!Array.isArray(points) ||
					points.length < 2 ||
					points.length > 60 ||
					points.some(
						(point, index) =>
							!Number.isFinite(point.x) ||
							!Number.isFinite(point.y) ||
							point.x < 0 ||
							point.x >= width ||
							point.y < 0 ||
							point.y >= height ||
							!Number.isFinite(point.time) ||
							point.time < 0 ||
							point.time > 5000 ||
							(index > 0 && point.time < points[index - 1].time)
					)
				)
					throw new Error('登录画面拖动坐标无效')
				await current.page.mouse.move(points[0].x, points[0].y)
				await current.page.mouse.down()
				try {
					for (let i = 1; i < points.length; i++) {
						await new Promise(resolve => setTimeout(resolve, points[i].time - points[i - 1].time))
						await current.page.mouse.move(points[i].x, points[i].y)
					}
				} finally {
					await current.page.mouse.up()
				}
				return { ok: true }
			}
			const kinds = ['click', 'move', 'down', 'up']
			if (
				!kinds.includes(input.kind) ||
				!Number.isFinite(input.x) ||
				!Number.isFinite(input.y) ||
				input.x < 0 ||
				input.x >= width ||
				input.y < 0 ||
				input.y >= height
			)
				throw new Error('登录画面坐标无效')
			if (input.kind === 'click') await current.page.mouse.click(input.x, input.y)
			else {
				await current.page.mouse.move(input.x, input.y)
				if (input.kind !== 'move') await current.page.mouse[input.kind]()
			}
			return { ok: true }
		},
		async capture(owner, id) {
			const current = await session(owner, id)
			const header = await cookie(current)
			if (!header) throw new Error('尚未登录知乎，请先扫码并完成验证')
			return header
		},
		async cancel(owner, id) {
			await session(owner, id)
			await close()
			return { ok: true }
		},
		close
	}
}
