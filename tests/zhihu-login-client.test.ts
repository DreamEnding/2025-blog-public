import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rssRuntime, publicRssRuntime } from '../src/lib/rss-runtime'
import { saveRsshub } from '../src/lib/site-rss'
import { resetDbForTests } from '../src/lib/site-db'
import { zhihuLoginAction, zhihuLoginFrame } from '../src/lib/zhihu-login'
import { signLoginResponse, verifyLoginRequest } from '../rsshub/login-protocol.mjs'

const temp = mkdtempSync(path.join(tmpdir(), 'zhihu-client-test-'))
let server: Server
let forged = false
let cancelled = false
const seen = new Map<string, number>()
before(async () => {
	process.env.DATA_DIR = temp
	server = createServer(async (request, response) => {
		if (request.url === '/__nexus/rsshub-status') {
			response.writeHead(200, { 'Content-Type': 'application/json' })
			response.end(JSON.stringify({ protocol: 'nexus-rsshub-1', revision: rssRuntime().revision, ready: true, error: '' }))
			return
		}
		let body = ''
		for await (const chunk of request) body += chunk.toString()
		const key = rssRuntime().loginKey
		const token = request.headers['x-nexus-login-authorization'] as string
		assert.equal(verifyLoginRequest(key, token, 'POST', request.url!, body, seen), true)
		const action = request.url!.split('/').at(-1)
		const bytes =
			action === 'frame'
				? Buffer.from('fake-png')
				: Buffer.from(
						JSON.stringify(
							action === 'capture'
								? { cookie: 'z_c0=private-automatic-login; d_c0=device' }
								: { id: 'a'.repeat(48), state: 'pending', expiresAt: '2026-10-04T23:00:00Z', width: 960, height: 720 }
						)
					)
		if (action === 'cancel') cancelled = true
		response.writeHead(200, {
			'Content-Type': action === 'frame' ? 'image/png' : 'application/json',
			'X-Nexus-Login-Response': forged ? '0'.repeat(64) : signLoginResponse(key, token, 200, bytes)
		})
		response.end(bytes)
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	saveRsshub({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })
})
after(async () => {
	await new Promise<void>(resolve => server.close(() => resolve()))
	resetDbForTests()
	rmSync(temp, { recursive: true, force: true })
})

test('automatically saves captured credentials while returning only masked configuration', async () => {
	const session = await zhihuLoginAction('start', {}, 'owner-a')
	assert.ok(rssRuntime().loginKey.length >= 32)
	assert.equal((await zhihuLoginFrame(session.id, 'owner-a')).toString(), 'fake-png')
	const result = await zhihuLoginAction('complete', { id: session.id }, 'owner-a')
	assert.equal(result.applied, true)
	assert.equal(rssRuntime().zhihuCookies, 'z_c0=private-automatic-login; d_c0=device')
	assert.equal(publicRssRuntime().cookieConfigured, true)
	assert.doesNotMatch(JSON.stringify(result), /private-automatic-login|device|loginKey/)
	assert.equal(cancelled, true)
})

test('rejects a forged browser response without overwriting private configuration', async () => {
	forged = true
	const current = rssRuntime().zhihuCookies
	await assert.rejects(zhihuLoginAction('complete', { id: 'a'.repeat(48) }, 'owner-a'), /安全扫码登录/)
	assert.equal(rssRuntime().zhihuCookies, current)
})
