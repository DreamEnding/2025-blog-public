export type MarkdownFormat = 'bold' | 'italic' | 'inline-code' | 'heading' | 'quote' | 'bullet' | 'ordered' | 'task' | 'link' | 'code' | 'table'

export function markdownEdit(text: string, from: number, to: number, format: MarkdownFormat) {
	const lineFormats = { heading: '## ', quote: '> ', bullet: '- ', ordered: '1. ', task: '- [ ] ' }
	if (format in lineFormats) {
		const start = from === 0 ? 0 : text.lastIndexOf('\n', from - 1) + 1
		const lineEnd = text.indexOf('\n', Math.max(from, to - 1))
		const end = lineEnd < 0 ? text.length : lineEnd
		const prefix = lineFormats[format as keyof typeof lineFormats]
		const selected = text.slice(start, end) || '文字'
		const insert = selected
			.split('\n')
			.map((line, index) => (format === 'ordered' ? `${index + 1}. ` : prefix) + line)
			.join('\n')
		return { from: start, to: end, insert, selection: { anchor: start + prefix.length, head: start + insert.length } }
	}
	const leading = from > 0 && text[from - 1] !== '\n' ? '\n\n' : ''
	const trailing = to < text.length && text[to] !== '\n' ? '\n\n' : ''
	if (format === 'table') {
		const insert = leading + '| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |' + trailing
		return { from, to, insert, selection: { anchor: from + leading.length + 2, head: from + leading.length + 4 } }
	}
	const wrappers = {
		bold: ['**', '**', '粗体文字'],
		italic: ['*', '*', '斜体文字'],
		'inline-code': ['`', '`', '代码'],
		link: ['[', '](https://)', '链接文字'],
		code: ['```text\n', '\n```', '在这里编写代码']
	}
	const [opening, closing, placeholder] = wrappers[format as keyof typeof wrappers]
	const prefix = (format === 'code' ? leading : '') + opening
	const suffix = closing + (format === 'code' ? trailing : '')
	const selected = text.slice(from, to) || placeholder
	const insert = prefix + selected + suffix
	return { from, to, insert, selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length } }
}
