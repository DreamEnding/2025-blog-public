import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createZhihuLogin, allowedLoginUrl, zhihuCookieHeader } from '../rsshub/zhihu-login.mjs'
import { signLoginRequest, verifyLoginRequest } from '../rsshub/login-protocol.mjs'

test('authenticates internal login requests and rejects tampering, expiry and replay', () => {
	const key = 'a'.repeat(64)
	const body = '{"owner":"owner-a"}'
	const replay = new Map<string, number>()
	const header = signLoginRequest(key, 'POST', '/__nexus/zhihu-login/start', body, 1000)
	assert.equal(verifyLoginRequest('', header, 'POST', '/__nexus/zhihu-login/start', body, new Map(), 1000), false)
	assert.equal(verifyLoginRequest(key, header, 'POST', '/__nexus/zhihu-login/start', body + ' ', new Map(), 1000), false)
	assert.equal(verifyLoginRequest(key, header, 'POST', '/__nexus/zhihu-login/start', body, replay, 1000), true)
	assert.equal(verifyLoginRequest(key, header, 'POST', '/__nexus/zhihu-login/start', body, replay, 1000), false)
	assert.equal(verifyLoginRequest(key, header, 'POST', '/__nexus/zhihu-login/start', body, new Map(), 62000), false)
})

test('restricts navigation/resources and exports only non-expired Zhihu credentials', () => {
	assert.equal(allowedLoginUrl('https://www.zhihu.com/signin'), true)
	assert.equal(allowedLoginUrl('https://pic1.zhimg.com/image.png'), true)
	for (const url of ['file:///etc/passwd', 'http://127.0.0.1/', 'https://zhihu.com.evil.test/', 'https://example.com/'])
		assert.equal(allowedLoginUrl(url), false)
	assert.equal(zhihuCookieHeader([{ name: 'd_c0', value: 'guest', domain: '.zhihu.com', expires: -1 }], 1000), null)
	const header = zhihuCookieHeader(
		[
			{ name: 'z_c0', value: 'private-login', domain: '.zhihu.com', expires: -1 },
			{ name: 'd_c0', value: 'device', domain: '.zhihu.com', expires: -1 },
			{ name: 'other', value: 'qq-secret', domain: '.qq.com', expires: -1 },
			{ name: 'expired', value: 'old', domain: '.zhihu.com', expires: 1 }
		],
		2000
	)
	assert.equal(header, 'z_c0=private-login; d_c0=device')
})

test('isolates the login owner, exposes no secrets in status/frame, and closes cancelled/expired sessions', async () => {
	let now = 1000
	let closed = 0
	let cookieValues: { name: string; value: string; domain: string; expires: number }[] = []
	const page = {
		goto: async () => ({ status: () => 200 }),
		url: () => 'https://www.zhihu.com/signin',
		screenshot: async () => Buffer.from('fake-png'),
		mouse: { click: async () => {}, move: async () => {}, down: async () => {}, up: async () => {} },
		isClosed: () => false
	}
	const controller = createZhihuLogin({
		clock: () => now,
		launch: async () => ({
			newContext: async () => ({ route: async () => {}, newPage: async () => page, cookies: async () => cookieValues }),
			close: async () => {
				closed++
			}
		})
	})
	const session = await controller.start('owner-a', '')
	assert.equal((await controller.status('owner-a', session.id)).state, 'pending')
	await assert.rejects(controller.status('owner-b', session.id), /会话/)
	await assert.rejects(controller.capture('owner-a', session.id), /尚未登录/)
	assert.equal((await controller.frame('owner-a', session.id)).toString(), 'fake-png')
	await assert.rejects(controller.start('owner-b', ''), /进行中/)
	cookieValues = [{ name: 'z_c0', value: 'private-session-cookie', domain: '.zhihu.com', expires: -1 }]
	assert.equal((await controller.status('owner-a', session.id)).state, 'authenticated')
	assert.doesNotMatch(JSON.stringify(await controller.status('owner-a', session.id)), /private-session-cookie/)
	assert.equal(await controller.capture('owner-a', session.id), 'z_c0=private-session-cookie')
	await assert.rejects(controller.frame('owner-a', session.id), /登录已完成/)
	await assert.rejects(controller.pointer('owner-a', session.id, { kind: 'click', x: -1, y: 0 }), /坐标/)
	await assert.rejects(
		controller.pointer('owner-a', session.id, {
			kind: 'drag',
			points: [
				{ x: 0, y: 0, time: 0 },
				{ x: 960, y: 0, time: 1 }
			]
		}),
		/坐标/
	)
	await controller.cancel('owner-a', session.id)
	assert.equal(closed, 1)
	await assert.rejects(controller.capture('owner-a', session.id), /会话/)
	const second = await controller.start('owner-a', '')
	now += 10 * 60 * 1000 + 1
	await assert.rejects(controller.status('owner-a', second.id), /过期/)
	assert.equal(closed, 2)
	await controller.close()
})
