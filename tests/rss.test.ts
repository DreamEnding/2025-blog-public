import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import { db, publicEntry, resetDbForTests, entries } from '../src/lib/site-db'
import { deleteEntry, publishEntry, saveEntry, withdrawEntry, publicSearch } from '../src/lib/site-actions'
import {
	deleteSubscription,
	importRssItem,
	parseFeed,
	previewRssItem,
	refreshSubscription,
	rssData,
	saveRsshub,
	saveSubscription,
	subscriptionUrl,
	validateRssBackup
} from '../src/lib/site-rss'
import { articleMarkdown } from '../src/lib/rss-markdown'
import { fetchLimited, httpUrl, isPublicAddress } from '../src/lib/rss-network'
import { listImages, localizeImages, replaceImageUrls, storeImage } from '../src/lib/site-images'
import { renderMarkdown } from '../src/lib/markdown-renderer'

const temp = mkdtempSync(path.join(tmpdir(), 'rss-site-test-'))
let server: Server
let base: string
let mode = 'feed'
const html =
	'<h2>模型调用</h2><p>正文 <strong>重点</strong></p><div class="highlight highlight-text-python"><pre>print(&quot;你好&quot;)\n```</pre></div><table><tr><th>模型</th><th>价格</th></tr><tr><td>测试</td><td>1</td></tr></table><p><img class="ztext-math" data-tex="x^2" src="https://www.zhihu.com/equation?tex=x" /></p><p><img data-original="https://127.0.0.1/private.png" src="placeholder" alt="配图" /></p>'
const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>作者</title><link>https://www.zhihu.com/people/example</link><item><title>RSS 技术文章</title><link>https://zhuanlan.zhihu.com/p/12345</link><dc:creator>作者</dc:creator><pubDate>Sun, 04 Oct 2026 00:00:00 GMT</pubDate><description>简短摘要</description><content:encoded><![CDATA[${html}]]></content:encoded></item></channel></rss>`

before(async () => {
	process.env.DATA_DIR = temp
	server = createServer((_request, response) => {
		if (mode === 'error') {
			response.writeHead(403)
			response.end('blocked')
		} else if (mode === 'redirect') {
			response.writeHead(302, { Location: 'http://169.254.169.254/metadata' })
			response.end()
		} else {
			response.writeHead(200, { 'Content-Type': 'application/rss+xml' })
			response.end(xml)
		}
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
	saveRsshub({ url: base })
})
after(async () => {
	await new Promise<void>(resolve => server.close(() => resolve()))
	resetDbForTests()
	rmSync(temp, { recursive: true, force: true })
})

test('normalizes Zhihu authors and columns and rejects invalid subscription input', () => {
	assert.equal(subscriptionUrl('https://www.zhihu.com/people/zhang-xiao-yu-45-67-74'), '/zhihu/posts/people/zhang-xiao-yu-45-67-74')
	assert.equal(subscriptionUrl('https://www.zhihu.com/org/example/posts'), '/zhihu/posts/org/example')
	assert.equal(subscriptionUrl('https://zhuanlan.zhihu.com/example'), '/zhihu/zhuanlan/example')
	assert.equal(subscriptionUrl('https://www.zhihu.com/column/c_123'), '/zhihu/zhuanlan/c_123')
	for (const value of ['', '//private/feed', 'file:///etc/passwd', 'https://user:secret@example.com/rss', 'https://zhuanlan.zhihu.com/p/123'])
		assert.throws(() => subscriptionUrl(value))
	assert.throws(() => saveSubscription({ name: '', url: '/test' }), /名称无效/)
	assert.throws(() => saveSubscription({ name: '重复', url: '/zhihu/posts/people/zhang-xiao-yu-45-67-74' }), /已存在/)
	assert.throws(() => saveRsshub({ url: 'https://example.com?key=1' }), /查询参数/)
})

test('reads RSS full content and Atom entries without inventing dates', async () => {
	const rss = await parseFeed(xml, base)
	assert.equal(rss.length, 1)
	assert.equal(rss[0].html, html)
	assert.equal(rss[0].author, '作者')
	assert.equal(rss[0].published_at, '2026-10-04T00:00:00.000Z')
	const atom = await parseFeed(
		'<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>文章</title><link href="https://example.com/post"/><content type="html">&lt;p&gt;Atom 正文&lt;/p&gt;</content></entry></feed>',
		base
	)
	assert.match(atom[0].html, /Atom 正文/)
	assert.equal(atom[0].published_at, null)
	await assert.rejects(parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml, base), /实体声明/)
	await assert.rejects(parseFeed('<html>not a feed</html>', base))
})

test('converts Zhihu code, tables, math and images into renderable safe Markdown', async () => {
	const markdown = articleMarkdown(
		html + '<script>alert(1)</script><iframe src="https://evil.com"></iframe><a href="javascript:alert(1)">链接</a>',
		'https://zhuanlan.zhihu.com/p/12345'
	)
	assert.match(markdown, /## 模型调用/)
	assert.match(markdown, /````python\nprint\("你好"\)\n```\n````/)
	assert.match(markdown, /\| 模型 \| 价格 \|/)
	assert.match(markdown, /\$x\^2\$/)
	assert.match(markdown, /!\[配图\]\(https:\/\/127\.0\.0\.1\/private.png\)/)
	assert.doesNotMatch(markdown, /alert|iframe|javascript/)
	const rendered = await renderMarkdown(markdown)
	assert.match(rendered.html, /<table>/)
	assert.match(rendered.html, /class="katex"/)
	assert.match(rendered.html, /<h2 id="模型调用">/)
	const links = articleMarkdown(
		'<a href="https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2Fdocs">文档</a><img src="/image.png"><img>',
		'https://zhuanlan.zhihu.com/p/12345'
	)
	assert.match(links, /https:\/\/example.com\/docs/)
	assert.match(links, /https:\/\/zhuanlan.zhihu.com\/image.png/)
	assert.equal((links.match(/!\[/g) || []).length, 1)
	assert.match(articleMarkdown('<table><tr><td>列</td></tr><tr><td>值</td></tr></table>', base), /\| 列 \|\n\| --- \|/)
	assert.equal(articleMarkdown('<img src="https://www.zhihu.com/equation?tex=E%3Dmc%5E2" />', base), '$E=mc^2$')
	assert.equal(articleMarkdown('<img data-tex="x^2" data-type="block" />', base), '$$\nx^2\n$$')
})

test('blocks private, mapped IPv6 and unsafe URLs, redirect hops and oversized streams', async () => {
	for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1'])
		assert.equal(isPublicAddress(address), false, address)
	assert.equal(isPublicAddress('1.1.1.1'), true)
	assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
	assert.throws(() => httpUrl('javascript:alert(1)'))
	await assert.rejects(fetchLimited(base, 5000), /内网地址/)
	await assert.rejects(fetchLimited(base, 20, base), /大小限制/)
	mode = 'redirect'
	await assert.rejects(fetchLimited(base, 5000, base), /内网地址/)
	mode = 'feed'
})

test('refreshes cached candidates and preserves them when the upstream is unavailable', async () => {
	const subscriptionId = saveSubscription({ name: '测试源', url: '/feed' })
	await refreshSubscription({ id: subscriptionId })
	await refreshSubscription({ id: subscriptionId })
	assert.equal(rssData(subscriptionId).items.length, 1)
	assert.ok(rssData(subscriptionId).subscriptions.find(row => row.id === subscriptionId)?.refreshed_at)
	mode = 'error'
	await assert.rejects(refreshSubscription({ id: subscriptionId }), /403/)
	assert.equal(rssData(subscriptionId).items.length, 1)
	assert.match(rssData(subscriptionId).subscriptions.find(row => row.id === subscriptionId)!.error, /403/)
	mode = 'feed'
})

test('imports only drafts, reports failed images, deduplicates across feeds and keeps publication snapshots', async () => {
	const item = rssData().subscriptions.find(row => row.url === '/feed')!
	const candidate = rssData(item.id).items[0]
	assert.match(previewRssItem({ id: candidate.id }).body, /来源：.*原文链接/)
	const result = await importRssItem({ id: candidate.id })
	assert.equal(result.warnings.length, 1)
	assert.equal(publicEntry(result.id), undefined)
	assert.equal(publicSearch('RSS 技术文章').length, 0)
	const draft = entries(true).find(row => row.id === result.id)!
	assert.equal(draft.source_url, candidate.link)
	assert.match(draft.body, /作者：作者/)
	publishEntry({ id: result.id })
	saveEntry({ ...draft, body: '人工编辑的新正文' })
	await refreshSubscription({ id: item.id })
	const duplicate = await importRssItem({ id: candidate.id })
	assert.equal(duplicate.id, result.id)
	assert.equal(duplicate.existing, true)
	assert.equal(entries(true).find(row => row.id === result.id)!.body, '人工编辑的新正文')
	assert.match(publicEntry(result.id)!.public_body!, /模型调用/)
	const otherId = saveSubscription({ name: '另一源', url: '/feed2' })
	await refreshSubscription({ id: otherId })
	assert.equal((await importRssItem({ id: rssData(otherId).items[0].id })).id, result.id)
	withdrawEntry({ id: result.id })
	assert.equal(publicEntry(result.id), undefined)
	assert.equal(publicSearch('RSS 技术文章').length, 0)
	assert.equal(rssData(item.id).items[0].published, 0)
	deleteSubscription({ id: item.id })
	assert.ok(entries(true).find(row => row.id === result.id))
	deleteEntry({ id: result.id })
	assert.equal(rssData(otherId).items[0].entry_id, null)
	const reimported = await importRssItem({ id: rssData(otherId).items[0].id })
	assert.ok(entries(true).find(row => row.id === reimported.id))
})

test('rejects empty article imports and invalid backup associations', async () => {
	const subscriptionId = rssData().subscriptions[0].id
	const itemId = Number(
		db()
			.prepare('INSERT INTO rss_items (subscription_id, title, link, html) VALUES (?, ?, ?, ?)')
			.run(subscriptionId, '空正文', 'https://example.com/empty', '').lastInsertRowid
	)
	await assert.rejects(importRssItem({ id: itemId }), /未提供正文/)
	const subscriptions = db().prepare('SELECT * FROM rss_subscriptions').all() as any[]
	const items = db().prepare('SELECT * FROM rss_items').all() as any[]
	assert.doesNotThrow(() => validateRssBackup(subscriptions, items))
	assert.throws(() => validateRssBackup(subscriptions, [{ ...items[0], subscription_id: 99999 }]), /无效/)
	assert.throws(() => validateRssBackup([...subscriptions, subscriptions[0]], items), /无效/)
})

test('stores and lists validated images and keeps failed remote images without changing code examples', async () => {
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
	const url = await storeImage(png, 'image/png')
	assert.ok((await listImages()).some(image => image.url === url && image.size === png.length))
	await assert.rejects(storeImage(png, 'image/svg+xml'), /只支持/)
	await assert.rejects(storeImage(Buffer.from('not an image'), 'image/png'), /不符/)
	await assert.rejects(storeImage(Buffer.alloc(9 * 1024 * 1024), 'image/png'), /8MB/)
	const body = `![本地](${url})\n\n![远程](http://127.0.0.1/private.png)\n\n\`![代码](http://127.0.0.1/example.png)\``
	const converted = await localizeImages(body)
	assert.equal(converted.body, body)
	assert.equal(converted.warnings.length, 1)
	assert.equal(converted.count, 0)
	const remote = 'https://example.com/image.png'
	const image = `![相同内容](${remote})`
	const example = `${image}\n\n\`${image}\`\n\n\`\`\`markdown\n${image}\n\`\`\`\n`
	assert.equal(replaceImageUrls(example, new Map([[remote, url]])), `![相同内容](${url})\n\n\`${image}\`\n\n\`\`\`markdown\n${image}\n\`\`\`\n`)
})
