import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Entry } from '../src/lib/site-db'
import { draftFields, reconcileEntry, reconcileSavedEntry, recoverDraft } from '../src/lib/admin-draft'

const saved: Entry = {
	id: 7,
	section_id: 3,
	title: '文章',
	summary: '',
	body: '已保存正文',
	position: 0,
	published: 1,
	public_title: '文章',
	public_summary: '',
	public_body: '公开正文',
	public_section_id: 3,
	public_position: 0,
	previous_title: null,
	previous_summary: null,
	previous_body: null,
	previous_section_id: null,
	previous_position: null,
	published_at: null
}

test('retains text entered while a server refresh is in flight', () => {
	const current = { ...saved, body: '请求期间继续输入的正文', summary: '新摘要' }
	const server = { ...saved, public_body: '刚发布的正文', published_at: '2026-10-03T00:00:00.000Z' }
	const result = reconcileEntry(current, server)
	assert.equal(result.body, '请求期间继续输入的正文')
	assert.equal(result.summary, '新摘要')
	assert.equal(result.public_body, '刚发布的正文')
	assert.equal(result.published_at, '2026-10-03T00:00:00.000Z')
})

test('recovers a local draft only when its saved baseline is still current', () => {
	const record = { base: draftFields(saved), draft: { ...draftFields(saved), body: '尚未保存的文字' } }
	assert.equal(recoverDraft(saved, record)?.body, '尚未保存的文字')
	assert.equal(recoverDraft({ ...saved, body: '另一处更新的正文' }, record), null)
	assert.equal(recoverDraft({ ...saved, id: 8 }, record), null)
	assert.equal(recoverDraft(saved, { base: draftFields(saved), draft: { body: 123 } }), null)
})

test('uses the canonical save result while preserving fields edited during the request', () => {
	const sent = { ...saved, title: ' 文章 ', summary: ' 摘要 ', body: '保存请求正文\n' }
	const server = { ...sent, title: '文章', summary: '摘要' }
	const current = { ...sent, body: '请求期间新增正文\n', position: 2 }
	const result = reconcileSavedEntry(current, draftFields(sent), server)
	assert.equal(result.title, '文章')
	assert.equal(result.summary, '摘要')
	assert.equal(result.body, current.body)
	assert.equal(result.position, 2)
	assert.deepEqual(reconcileSavedEntry(sent, draftFields(sent), server), server)
	assert.equal(recoverDraft(server, { base: draftFields(server), draft: draftFields(result) })?.body, current.body)
})
