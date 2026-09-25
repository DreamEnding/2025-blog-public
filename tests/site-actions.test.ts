import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
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
	assert.equal(settings().name, '新站点')
	assert.throws(() => createEntry({ section_id: 999, title: 'x' }), /不存在/)
	assert.throws(() => createEntry({ section_id: 1, title: '' }), /最多保留一篇|标题无效/)
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
