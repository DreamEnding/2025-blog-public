import { readFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createZhihuLogin } from './zhihu-login.mjs'
import { signLoginResponse, verifyLoginRequest } from './login-protocol.mjs'

const port = Number(process.env.PORT || 1200)
const workerPort = port + 1
const file = process.env.RSSHUB_RUNTIME_FILE || '/rsshub-config/runtime.json'
let worker
let snapshot = ''
let revision = null
let ready = false
let loading = false
let stopping = false
let error = ''
const login = createZhihuLogin()
const seenLoginRequests = new Map()

async function loginRequest(request, response) {
	const pathname = request.url
	let config
	try {
		config = JSON.parse(await readFile(file, 'utf8'))
	} catch {}
	let body = ''
	for await (const chunk of request) {
		body += chunk.toString('utf8')
		if (body.length > 8192) {
			response.writeHead(413)
			response.end()
			return
		}
	}
	const token = request.headers['x-nexus-login-authorization']
	if (!verifyLoginRequest(config?.loginKey, token, request.method, pathname, body, seenLoginRequests)) {
		response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
		response.end(JSON.stringify({ error: '登录服务请求认证失败' }))
		return
	}
	function reply(status, value, type = 'application/json') {
		const bytes = type === 'image/png' ? value : Buffer.from(JSON.stringify(value))
		response.writeHead(status, {
			'Content-Type': type,
			'Cache-Control': 'no-store',
			'X-Nexus-Login-Response': signLoginResponse(config.loginKey, token, status, bytes)
		})
		response.end(bytes)
	}
	try {
		const input = JSON.parse(body)
		if (typeof input.owner !== 'string' || !input.owner || input.owner.length > 160) throw new Error('登录会话无效')
		const action = pathname.slice('/__nexus/zhihu-login/'.length)
		if (action === 'start') reply(200, await login.start(input.owner, config.rsshubProxy ?? process.env.PROXY_URI ?? ''))
		else if (action === 'status') reply(200, await login.status(input.owner, input.id))
		else if (action === 'frame') reply(200, await login.frame(input.owner, input.id), 'image/png')
		else if (action === 'pointer') reply(200, await login.pointer(input.owner, input.id, input))
		else if (action === 'capture') reply(200, { cookie: await login.capture(input.owner, input.id) })
		else if (action === 'cancel') reply(200, await login.cancel(input.owner, input.id))
		else reply(404, { error: '未知登录操作' })
	} catch (cause) {
		reply(400, { error: cause.message || '知乎登录操作失败' })
	}
}

function workerHealthy() {
	return new Promise(resolve => {
		const request = httpRequest({ hostname: '127.0.0.1', port: workerPort, path: '/healthz', timeout: 1000 }, response => {
			response.resume()
			resolve(response.statusCode === 200)
		})
		request.on('error', () => resolve(false))
		request.on('timeout', () => request.destroy())
		request.end()
	})
}

async function stopWorker() {
	const current = worker
	worker = undefined
	if (!current || current.exitCode !== null) return
	await new Promise(resolve => {
		const timeout = setTimeout(() => current.kill('SIGKILL'), 5000)
		current.once('exit', () => {
			clearTimeout(timeout)
			resolve()
		})
		current.kill('SIGTERM')
	})
}

async function reload() {
	if (loading || stopping) return
	loading = true
	try {
		let config = {}
		try {
			config = JSON.parse(await readFile(file, 'utf8'))
		} catch (cause) {
			if (cause.code !== 'ENOENT') throw cause
		}
		const desired = {
			revision: config.revision ?? null,
			zhihuCookies: config.zhihuCookies ?? process.env.ZHIHU_COOKIES ?? '',
			rsshubProxy: config.rsshubProxy ?? process.env.PROXY_URI ?? ''
		}
		if (
			(desired.revision !== null && typeof desired.revision !== 'string') ||
			typeof desired.zhihuCookies !== 'string' ||
			typeof desired.rsshubProxy !== 'string'
		)
			throw new Error('Invalid configuration')
		const next = JSON.stringify(desired)
		if (next === snapshot && worker && ready) return
		ready = false
		error = ''
		await stopWorker()
		if (stopping) return
		const current = spawn(process.execPath, ['--max-http-header-size=32768', path.join(process.cwd(), 'dist', 'index.mjs')], {
			env: { ...process.env, PORT: String(workerPort), ZHIHU_COOKIES: desired.zhihuCookies, PROXY_URI: desired.rsshubProxy },
			stdio: 'inherit'
		})
		worker = current
		current.on('exit', () => {
			if (worker === current) {
				worker = undefined
				ready = false
				error = 'RSSHub 抓取进程已停止，正在重试启动'
			}
		})
		current.on('error', () => {
			error = 'RSSHub 抓取进程启动失败，请检查服务日志'
			ready = false
		})
		const deadline = Date.now() + 20000
		while (worker === current && !stopping && Date.now() < deadline) {
			if (await workerHealthy()) {
				snapshot = next
				revision = desired.revision
				ready = true
				console.log('RSSHub configuration loaded')
				return
			}
			await new Promise(resolve => setTimeout(resolve, 250))
		}
		error = 'RSSHub 启动未完成，请稍后检查连接'
	} catch {
		error = 'RSSHub 配置文件无效，请重新保存配置'
	} finally {
		loading = false
	}
}

const server = createServer((request, response) => {
	if (request.url?.startsWith('/__nexus/zhihu-login/')) {
		void loginRequest(request, response).catch(() => {
			if (!response.headersSent) response.writeHead(400)
			response.end()
		})
		return
	}
	if (request.url === '/__nexus/rsshub-status') {
		response.writeHead(request.method === 'GET' ? 200 : 405, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
		response.end(JSON.stringify({ protocol: 'nexus-rsshub-1', revision, ready, error }))
		return
	}
	if (!ready) {
		response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
		response.end('RSSHub 正在加载配置，请稍后重试')
		return
	}
	const upstream = httpRequest(
		{ hostname: '127.0.0.1', port: workerPort, path: request.url, method: request.method, headers: request.headers, timeout: 30000 },
		incoming => {
			response.writeHead(incoming.statusCode || 502, incoming.headers)
			incoming.pipe(response)
		}
	)
	upstream.on('timeout', () => upstream.destroy())
	upstream.on('error', () => {
		if (!response.headersSent) response.writeHead(502)
		response.end('RSSHub 暂时无法响应，请稍后重试')
	})
	request.on('aborted', () => upstream.destroy())
	response.on('close', () => upstream.destroy())
	request.pipe(upstream)
})

server.listen(port, '0.0.0.0', () => {
	void reload()
})
const timer = setInterval(() => {
	void reload()
}, 1000)
async function stop() {
	if (stopping) return
	stopping = true
	ready = false
	clearInterval(timer)
	await login.close()
	await stopWorker()
	server.closeAllConnections()
	server.close(() => process.exit(0))
}
process.on('SIGTERM', () => {
	void stop()
})
process.on('SIGINT', () => {
	void stop()
})
