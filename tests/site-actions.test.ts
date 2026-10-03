import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
	adminData,
	createEntry,
	createSection,
	deleteSection,
	publishEntry,
	publicSearch,
	restoreEntry,
	saveEntry,
	saveSettings,
	withdrawEntry
} from '../src/lib/site-actions'
import { db, entries, publicEntry, resetDbForTests, sections, settings } from '../src/lib/site-db'
import { renderMarkdown } from '../src/lib/markdown-renderer'
import { readLegacyFile, saveLegacyFiles } from '../src/lib/legacy-files'
import { entryPath } from '../src/lib/content-sections'
import { pageMetadata } from '../src/lib/site-metadata'

const temp = mkdtempSync(path.join(tmpdir(), 'docs-site-test-'))
before(() => {
	process.env.DATA_DIR = temp
})
after(() => {
	resetDbForTests()
	rmSync(temp, { recursive: true, force: true })
})

test('initializes only fixed content sections', () => {
	assert.deepEqual(
		sections().map(item => item.name),
		['API 文档', '使用教程', 'AI 技术分享']
	)
	assert.throws(() => createSection(), /栏目固定/)
	assert.throws(() => deleteSection(), /栏目固定/)
})

test('imports the Nexus AI tutorial once with renderable public image paths', async () => {
	const tutorial = entries().find(item => item.public_title === 'Nexus AI 使用教程')
	assert.ok(tutorial)
	assert.equal(sections().find(item => item.id === tutorial.section_id)?.name, '使用教程')
	assert.equal((tutorial.public_body?.match(/!\[[^\]]+\]\(\/tutorials\/nexus-ai\/image/g) || []).length, 8)
	const rendered = await renderMarkdown(tutorial.public_body || '')
	assert.equal((rendered.html.match(/<img src="\/tutorials\/nexus-ai\/image/g) || []).length, 8)
	assert.deepEqual(
		rendered.toc.filter(item => item.level === 2).map(item => item.text),
		['准备工作', '创建 API 密钥', '导入 CC Switch']
	)
	resetDbForTests()
	assert.equal(entries().filter(item => item.public_title === 'Nexus AI 使用教程').length, 1)
	db().prepare('DELETE FROM entries WHERE id = ?').run(tutorial.id)
})

test('imports the Nexus API reference once without generic gateway content', async () => {
	const apiDoc = entries().find(item => item.public_title === 'Nexus API 文档')
	assert.ok(apiDoc)
	assert.equal(sections().find(item => item.id === apiDoc.section_id)?.name, 'API 文档')
	assert.match(apiDoc.public_body || '', /https:\/\/www\.chream\.me\/v1/)
	assert.doesNotMatch(apiDoc.public_body || '', /Sub2API|backend-api\/codex/i)
	const rendered = await renderMarkdown(apiDoc.public_body || '')
	assert.ok(rendered.toc.some(item => item.text === 'OpenAI 兼容接口'))
	resetDbForTests()
	assert.equal(entries().filter(item => item.public_title === 'Nexus API 文档').length, 1)
	db().prepare('DELETE FROM entries WHERE id = ?').run(apiDoc.id)
})

test('keeps drafts private until publication and retains public version while editing', () => {
	const target = sections().find(item => item.name === 'API 文档')!
	const id = Number(createEntry({ section_id: target.id, title: '调用 API' }))
	saveEntry({ id, section_id: target.id, title: '调用 API', summary: '第一次调用', body: '旧版公开正文', position: 0 })
	assert.equal(publicEntry(id), undefined)
	assert.equal(publicSearch('旧版').length, 0)
	publishEntry({ id })
	assert.equal(publicEntry(id)?.public_body, '旧版公开正文')
	const movedTo = sections().find(item => item.name === '使用教程')!
	saveEntry({ id, section_id: movedTo.id, title: '调用 API', summary: '新版摘要', body: '新版草稿正文', position: 5 })
	assert.equal(publicEntry(id)?.public_body, '旧版公开正文')
	assert.equal(publicEntry(id)?.section_id, target.id)
	assert.equal(publicEntry(id)?.position, 0)
	assert.equal(publicSearch('新版').length, 0)
	assert.throws(() => createEntry({ section_id: target.id, title: '第二份 API 文档' }), /最多保留一篇/)
	publishEntry({ id })
	assert.equal(publicSearch('新版').length, 1)
	assert.equal(publicEntry(id)?.section_id, movedTo.id)
	restoreEntry({ id })
	assert.equal(publicEntry(id)?.public_body, '旧版公开正文')
	assert.equal(publicEntry(id)?.section_id, target.id)
	withdrawEntry({ id })
	assert.equal(publicEntry(id), undefined)
	assert.equal(publicSearch('旧版').length, 0)
	assert.equal(entries(true).length, 1)
	assert.throws(() => deleteSection(), /栏目固定/)
})

test('limits API documents to one entry and sorts recent published articles', async () => {
	db().prepare('DELETE FROM entries').run()
	const { recentArticles } = await import('../src/lib/content-sections')
	const api = sections().find(item => item.name === 'API 文档')!
	const tutorials = sections().find(item => item.name === '使用教程')!
	const sharing = sections().find(item => item.name === 'AI 技术分享')!
	const apiId = Number(createEntry({ section_id: api.id, title: '唯一文档' }))
	assert.throws(() => createEntry({ section_id: api.id, title: '第二篇' }), /最多保留一篇/)
	const tutorialId = Number(createEntry({ section_id: tutorials.id, title: '教程' }))
	const sharingId = Number(createEntry({ section_id: sharing.id, title: '分享' }))
	saveEntry({ id: tutorialId, section_id: tutorials.id, title: '教程', summary: '', body: '公开教程', position: 0 })
	saveEntry({ id: sharingId, section_id: sharing.id, title: '分享', summary: '', body: '公开分享', position: 0 })
	publishEntry({ id: tutorialId })
	publishEntry({ id: sharingId })
	assert.deepEqual(
		recentArticles().map(item => item.id),
		[sharingId, tutorialId]
	)
	assert.throws(() => saveEntry({ id: sharingId, section_id: api.id, title: '分享', summary: '', body: '', position: 0 }), /最多保留一篇/)
	assert.equal(publicEntry(apiId), undefined)
})

test('rejects invalid settings and content input', () => {
	assert.throws(() => saveSettings({ name: '站点', logo: 'javascript:bad', intro: '', consoleUrl: '', apiKeyUrl: '' }), /HTTP/)
	assert.equal(settings().name, undefined)
	saveSettings({ name: '新站点', logo: '', intro: '介绍', consoleUrl: 'https://example.com/console', apiKeyUrl: '' })
	assert.equal(adminData().settings.name, '新站点')
	assert.throws(() => createEntry({ section_id: 999, title: 'x' }), /不存在/)
	assert.throws(() => createEntry({ section_id: 1, title: '' }), /最多保留一篇|标题无效/)
})

test('shares site information between the admin settings and homepage configuration', async () => {
	saveSettings({
		name: '测试站点',
		username: '测试作者',
		logo: '/api/uploads/test.png',
		intro: '站点介绍',
		consoleUrl: 'https://example.com',
		apiKeyUrl: '',
		githubUrl: 'https://github.com/DreamEnding',
		email: 'hello@example.com',
		juejinUrl: '',
		analyticsId: 'G-TEST123'
	})
	const config = JSON.parse((await readLegacyFile('src/config/site-content.json'))!.toString('utf8'))
	assert.equal(config.meta.title, '测试站点')
	assert.equal(config.meta.username, '测试作者')
	assert.equal(config.meta.description, '站点介绍')
	assert.equal(config.logo, '/api/uploads/test.png')
	assert.equal(config.analyticsId, 'G-TEST123')
	assert.ok(config.socialButtons.some((button: { type: string; value: string }) => button.type === 'email' && button.value === 'hello@example.com'))
	assert.ok(!config.socialButtons.some((button: { type: string }) => button.type === 'juejin'))
	config.meta.title = '首页更新站名'
	config.meta.description = '首页更新介绍'
	saveLegacyFiles([{ path: 'src/config/site-content.json', content: Buffer.from(JSON.stringify(config)).toString('base64') }])
	assert.equal(adminData().settings.name, '首页更新站名')
	assert.equal(adminData().settings.intro, '首页更新介绍')
	const metadata = pageMetadata('使用教程', '', '/tutorials')
	assert.equal(metadata.title, '使用教程 | 首页更新站名')
	assert.equal(metadata.description, '首页更新介绍')
	assert.throws(() => saveSettings({ ...adminData().settings, analyticsId: '<script>' }), /统计 ID/)
	assert.equal(adminData().settings.name, '首页更新站名')
})

test('keeps a single tutorial across drafts, publication and version restoration', () => {
	db().prepare('DELETE FROM entries').run()
	const tutorial = sections().find(item => item.name === '使用教程')!
	const sharing = sections().find(item => item.name === 'AI 技术分享')!
	const tutorialId = Number(createEntry({ section_id: tutorial.id, title: '唯一教程' }))
	assert.throws(() => createEntry({ section_id: tutorial.id, title: '第二篇教程' }), /使用教程最多保留一篇/)
	saveEntry({ id: tutorialId, section_id: tutorial.id, title: '唯一教程', summary: '', body: '公开教程', position: 0 })
	publishEntry({ id: tutorialId })
	const sharingId = Number(createEntry({ section_id: sharing.id, title: '技术分享' }))
	assert.throws(
		() => saveEntry({ id: sharingId, section_id: tutorial.id, title: '分享转教程', summary: '', body: '正文', position: 0 }),
		/使用教程最多保留一篇/
	)
	saveEntry({ id: tutorialId, section_id: sharing.id, title: '教程转分享', summary: '', body: '技术分享正文', position: 0 })
	assert.throws(() => createEntry({ section_id: tutorial.id, title: '新教程' }), /使用教程最多保留一篇/)
	publishEntry({ id: tutorialId })
	createEntry({ section_id: tutorial.id, title: '替换教程' })
	assert.throws(() => restoreEntry({ id: tutorialId }), /使用教程最多保留一篇/)
	assert.equal(publicEntry(tutorialId)?.section_id, sharing.id)
})

test('links public search results to their canonical reading pages', () => {
	db().prepare('DELETE FROM entries').run()
	for (const [name, expected] of [
		['API 文档', '/api-docs'],
		['使用教程', '/tutorials'],
		['AI 技术分享', null]
	] as const) {
		const target = sections().find(item => item.name === name)!
		const id = Number(createEntry({ section_id: target.id, title: `${name}搜索用例` }))
		saveEntry({ id, section_id: target.id, title: `${name}搜索用例`, summary: '公开摘要', body: '公开搜索关键词', position: 0 })
		publishEntry({ id })
		saveEntry({ id, section_id: target.id, title: '未发布标题', summary: '草稿摘要', body: '草稿独有词', position: 0 })
		const result = publicSearch(name)[0]
		assert.equal(result.title, `${name}搜索用例`)
		assert.equal(entryPath(result), expected || `/articles/${id}`)
	}
	assert.equal(publicSearch('草稿独有词').length, 0)
	assert.equal(publicSearch('未发布标题').length, 0)
})

test('does not recreate deleted sections on restart', () => {
	db().prepare('DELETE FROM entries').run()
	db().prepare('DELETE FROM sections').run()
	resetDbForTests()
	assert.equal(sections().length, 0)
})

test('backs up and clears old SQLite content once', () => {
	db().prepare("DELETE FROM meta WHERE key = 'content_redesign_20260925'").run()
	db().prepare("INSERT INTO sections (name, kind, position) VALUES ('模型选择', 'docs', 0)").run()
	const oldSection = sections().find(item => item.name === '模型选择')!
	db().prepare("INSERT INTO entries (section_id, title, body) VALUES (?, '旧文档', '旧正文')").run(oldSection.id)
	resetDbForTests()
	assert.deepEqual(
		sections().map(item => item.name),
		['API 文档', '使用教程', 'AI 技术分享']
	)
	assert.equal(entries(true).length, 0)
	assert.equal(existsSync(path.join(temp, 'site-before-content-redesign.db')), true)
	resetDbForTests()
	assert.equal(entries(true).length, 0)
})

test('returns the saved entry and preserves meaningful Markdown whitespace', () => {
	const target = sections().find(item => item.name === 'AI 技术分享')!
	const id = Number(createEntry({ section_id: target.id, title: 'Markdown 草稿' }))
	const body = '    缩进代码\n\n正文末尾保留换行  \n'
	const saved = saveEntry({ id, section_id: target.id, title: ' 标题 ', summary: ' 摘要 ', body, position: 0 })
	assert.equal(saved.title, '标题')
	assert.equal(saved.summary, '摘要')
	assert.equal(saved.body, body)
	assert.equal(adminData().entries.find(item => item.id === id)?.body, body)
	assert.equal(publicEntry(id), undefined)
})
