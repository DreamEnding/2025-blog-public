import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:http'
import { adminData } from '../src/lib/site-actions'
import { db, resetDbForTests } from '../src/lib/site-db'
import { rssRuntime, publicRssRuntime, runtimeFile, writeRssRuntime, nextRssRuntime } from '../src/lib/rss-runtime'
import { checkRsshub, saveRssSettings } from '../src/lib/site-rss'

const temp = mkdtempSync(path.join(tmpdir(), 'rss-settings-test-'))
let server: Server
let base: string
let managed = true
before(async () => {
	process.env.DATA_DIR = temp
	process.env.ZHIHU_COOKIES = 'd_c0=environment-cookie'
	process.env.RSSHUB_PROXY_URI = 'http://default-proxy.example:7897'
	process.env.RSS_FETCH_PROXY = ''
	server = createServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'application/json' })
		response.end(JSON.stringify(managed ? { protocol: 'nexus-rsshub-1', revision: rssRuntime().revision, ready: true, error: '' } : { rsshub: true }))
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(async () => {
	await new Promise<void>(resolve => server.close(() => resolve()))
	resetDbForTests()
	rmSync(temp, { recursive: true, force: true })
})

test('validates Cookie and proxy input before changing saved configuration', () => {
	for (const cookie of ['a=one\r\nX-Header: injected', 'x'.repeat(32001), 123]) assert.throws(() => nextRssRuntime({ zhihuCookies: cookie }), /Cookie/)
	for (const proxy of ['file:///private', 'socks5://localhost:7897', 'http://localhost:0', 'http://proxy.example/?token=secret', 'http://proxy\n.example'])
		assert.throws(() => nextRssRuntime({ fetchProxy: proxy }), /代理/)
	assert.throws(() => nextRssRuntime({ zhihuCookies: 'a=b', clearCookie: true }), /同时/)
	assert.throws(() => nextRssRuntime({ clearCookie: 'true' }), /无效/)
	assert.equal(rssRuntime().zhihuCookies, 'd_c0=environment-cookie')
})

test('retains blank fields, replaces secrets, and explicitly clears environment defaults', () => {
	const next = nextRssRuntime({ zhihuCookies: 'Cookie: d_c0=private-cookie-marker', fetchProxy: 'http://alice:proxy-password-marker@127.0.0.1:7897' })
	writeRssRuntime(next)
	assert.equal(rssRuntime().zhihuCookies, 'd_c0=private-cookie-marker')
	assert.equal(nextRssRuntime({ zhihuCookies: '', fetchProxy: '' }).zhihuCookies, next.zhihuCookies)
	assert.equal(nextRssRuntime({ zhihuCookies: '', fetchProxy: '' }).fetchProxy, next.fetchProxy)
	const publicJson = JSON.stringify(publicRssRuntime())
	assert.doesNotMatch(publicJson, /private-cookie-marker|proxy-password-marker|alice/)
	assert.equal(publicRssRuntime().cookieConfigured, true)
	assert.match(publicRssRuntime().fetchProxySummary, /\*\*\*@127\.0\.0\.1:7897/)
	assert.doesNotMatch(JSON.stringify(adminData()), /private-cookie-marker|proxy-password-marker/)
	assert.equal((db().prepare("SELECT COUNT(*) AS count FROM settings WHERE key != 'rsshub_url'").get() as { count: number }).count, 0)
	writeRssRuntime(nextRssRuntime({ clearCookie: true, clearRsshubProxy: true, clearFetchProxy: true }))
	assert.equal(rssRuntime().zhihuCookies, '')
	assert.equal(rssRuntime().rsshubProxy, '')
	assert.equal(rssRuntime().fetchProxy, '')
	assert.equal(publicRssRuntime().cookieConfigured, false)
})

test('saves and confirms settings only for a matching managed RSSHub instance', async () => {
	assert.equal((await checkRsshub({ url: base })).managed, true)
	const result = await saveRssSettings({ url: base, zhihuCookies: 'd_c0=managed-cookie', rsshubProxy: 'http://127.0.0.1:7897' })
	assert.equal(result.applied, true)
	assert.equal(result.configuration.cookieConfigured, true)
	assert.doesNotMatch(JSON.stringify(result), /managed-cookie/)
	const saved = readFileSync(runtimeFile(), 'utf8')
	await assert.rejects(saveRssSettings({ url: base, fetchProxy: 'javascript:bad' }), /代理/)
	assert.equal(readFileSync(runtimeFile(), 'utf8'), saved)
	managed = false
	await assert.rejects(saveRssSettings({ url: base, zhihuCookies: 'd_c0=should-not-save' }), /未接入/)
	assert.equal(readFileSync(runtimeFile(), 'utf8'), saved)
	assert.equal((await checkRsshub({ url: base })).managed, false)
})
