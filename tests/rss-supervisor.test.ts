import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('loads and reloads Cookie/proxy in the RSSHub worker without exposing secrets in status', { timeout: 20000 }, async t => {
	const temp = mkdtempSync(path.join(tmpdir(), 'rss-supervisor-test-'))
	const reservation = createServer()
	await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
	const port = (reservation.address() as { port: number }).port
	await new Promise<void>(resolve => reservation.close(() => resolve()))
	assert.ok(port < 65535)
	mkdirSync(path.join(temp, 'dist'))
	writeFileSync(
		path.join(temp, 'dist', 'index.mjs'),
		`
		import { createServer } from 'node:http'
		import { createHash } from 'node:crypto'
		console.log('FAKE_WORKER_PID=' + process.pid)
		createServer((request, response) => {
			response.end(request.url === '/healthz' ? 'ok' : JSON.stringify({
				cookie: createHash('sha256').update(process.env.ZHIHU_COOKIES || '').digest('hex'),
				proxy: createHash('sha256').update(process.env.PROXY_URI || '').digest('hex')
			}))
		}).listen(Number(process.env.PORT), '127.0.0.1')
	`
	)
	const configFile = path.join(temp, 'runtime.json')
	const cookie = 'd_c0=private-worker-cookie'
	const proxy = 'http://alice:private-worker-proxy@proxy.example:7897'
	writeFileSync(configFile, JSON.stringify({ revision: 'first', zhihuCookies: cookie, rsshubProxy: proxy }))
	const child = spawn(process.execPath, [path.join(process.cwd(), 'rsshub', 'runtime.mjs')], {
		cwd: temp,
		env: { ...process.env, PORT: String(port), RSSHUB_RUNTIME_FILE: configFile },
		stdio: ['ignore', 'pipe', 'pipe']
	})
	let output = ''
	let workerPid = 0
	child.stdout.on('data', chunk => {
		output += chunk.toString()
		const matches = [...output.matchAll(/FAKE_WORKER_PID=(\d+)/g)]
		workerPid = Number(matches.at(-1)?.[1] || 0)
	})
	child.stderr.on('data', chunk => {
		output += chunk.toString()
	})
	t.after(async () => {
		if (workerPid) {
			try {
				process.kill(workerPid, 'SIGTERM')
			} catch {}
		}
		const closed = child.exitCode === null ? new Promise(resolve => child.once('exit', resolve)) : Promise.resolve()
		child.kill('SIGTERM')
		await closed
		rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
	})
	const base = `http://127.0.0.1:${port}`
	async function waitForRevision(revision: string) {
		const deadline = Date.now() + 8000
		do {
			try {
				const status = await (await fetch(`${base}/__nexus/rsshub-status`)).json()
				if (status.ready && status.revision === revision) return status
			} catch {}
			await new Promise(resolve => setTimeout(resolve, 100))
		} while (Date.now() < deadline)
		assert.fail(`RSSHub did not apply ${revision}: ${output}`)
	}
	const status = await waitForRevision('first')
	assert.equal(status.protocol, 'nexus-rsshub-1')
	assert.doesNotMatch(JSON.stringify(status), /private-worker|alice/)
	const probe = await (await fetch(`${base}/probe`)).json()
	assert.equal(probe.cookie, createHash('sha256').update(cookie).digest('hex'))
	assert.equal(probe.proxy, createHash('sha256').update(proxy).digest('hex'))
	writeFileSync(configFile, JSON.stringify({ revision: 'second', zhihuCookies: '', rsshubProxy: '' }))
	await waitForRevision('second')
	const updated = await (await fetch(`${base}/probe`)).json()
	assert.equal(updated.cookie, createHash('sha256').update('').digest('hex'))
	assert.equal(updated.proxy, createHash('sha256').update('').digest('hex'))
	assert.doesNotMatch(output, /private-worker-cookie|private-worker-proxy/)
})
