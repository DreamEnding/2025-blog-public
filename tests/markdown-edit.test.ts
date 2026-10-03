import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownEdit } from '../src/lib/markdown-edit'

test('formats a selection while preserving surrounding text and selecting the formatted words', () => {
	const body = '把记录写下来'
	const edit = markdownEdit(body, 1, 3, 'bold')
	assert.equal(body.slice(0, edit.from) + edit.insert + body.slice(edit.to), '把**记录**写下来')
	assert.deepEqual(edit.selection, { anchor: 3, head: 5 })
})

test('adds list markers to complete selected lines', () => {
	const body = '前言\n第一项\n第二项\n结语'
	const edit = markdownEdit(body, 4, 10, 'bullet')
	assert.equal(body.slice(0, edit.from) + edit.insert + body.slice(edit.to), '前言\n- 第一项\n- 第二项\n结语')
})

test('provides an editable placeholder for an empty code block', () => {
	const edit = markdownEdit('', 0, 0, 'code')
	assert.equal(edit.insert, '```text\n在这里编写代码\n```')
	assert.equal(edit.insert.slice(edit.selection.anchor, edit.selection.head), '在这里编写代码')
})

test('inserts block tools on separate lines when the cursor is inside a paragraph', () => {
	for (const format of ['code', 'table'] as const) {
		const edit = markdownEdit('前文后文', 2, 2, format)
		const result = '前文后文'.slice(0, edit.from) + edit.insert + '前文后文'.slice(edit.to)
		assert.match(result, format === 'code' ? /^前文\n\n```text\n/ : /^前文\n\n\| 标题/)
		assert.match(result, /\n\n后文$/)
	}
})
