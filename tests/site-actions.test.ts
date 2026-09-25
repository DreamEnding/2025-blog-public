import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('initializes five empty sections and enforces hierarchy', () => {
	assert.equal(sections().length, 5)
	const articles = sections().find(item => item.kind === 'articles')!
	assert.throws(() => createSection({ name: '非法分组', kind: 'docs', parent_id: articles.id }), /一级分组/)
	const parent = sections().find(item => item.kind === 'docs')!
	const child = Number(createSection({ name: '认证', kind: 'docs', parent_id: parent.id }))
	assert.throws(() => createSection({ name: '第三级', kind: 'docs', parent_id: child }), /一级分组/)
	assert.throws(() => deleteSection({ id: parent.id }), /先处理/)
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
	assert.throws(() => deleteSection({ id: target.id }), /先处理/)
})

test('rejects invalid settings and content input', () => {
	assert.throws(() => saveSettings({ name: '站点', logo: 'javascript:bad', intro: '', consoleUrl: '', apiKeyUrl: '' }), /HTTP/)
	assert.equal(settings().name, undefined)
	saveSettings({ name: '新站点', logo: '', intro: '介绍', consoleUrl: 'https://example.com/console', apiKeyUrl: '' })
	assert.equal(settings().name, '新站点')
	assert.throws(() => createEntry({ section_id: 999, title: 'x' }), /不存在/)
	assert.throws(() => createEntry({ section_id: 1, title: '' }), /标题无效/)
})

test('does not recreate deleted sections on restart', () => {
	db().prepare('DELETE FROM entries').run()
	db().prepare('DELETE FROM sections WHERE parent_id IS NOT NULL').run()
	db().prepare('DELETE FROM sections').run()
	resetDbForTests()
	assert.equal(sections().length, 0)
})
