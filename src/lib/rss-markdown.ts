import { load } from 'cheerio'
import TurndownService from 'turndown'
import { tables, strikethrough, taskListItems } from 'turndown-plugin-gfm'
import { httpUrl } from './rss-network'

function link(value: string, base: string) {
	try {
		return httpUrl(new URL(value, base).href).href
	} catch {
		return ''
	}
}

export function articleMarkdown(html: string, source: string) {
	const $ = load(html)
	$('script, style, iframe, object, embed, form, input, button, noscript').remove()
	$('img').each((_index, element) => {
		const image = $(element)
		const src = image.attr('data-original') || image.attr('data-actualsrc') || image.attr('data-src') || image.attr('src') || ''
		let equation = image.attr('data-tex')
		try {
			const url = new URL(src, source)
			if (!equation && ['www.zhihu.com', 'zhihu.com'].includes(url.hostname) && url.pathname === '/equation')
				equation = url.searchParams.get('tex') || image.attr('alt')
		} catch {}
		if (equation) {
			const math = $('<span></span>')
				.attr('data-tex', equation)
				.attr('data-display', image.hasClass('ztext-math-block') || image.attr('data-type') === 'block' ? 'block' : 'inline')
				.text(equation)
			image.replaceWith(math)
			return
		}
		const url = src ? link(src, source) : ''
		if (url) image.attr('src', url)
		else image.remove()
	})
	$('a').each((_index, element) => {
		const anchor = $(element)
		let href = anchor.attr('href') || ''
		try {
			const url = new URL(href, source)
			if (url.hostname === 'link.zhihu.com') href = url.searchParams.get('target') || href
		} catch {}
		const url = link(href, source)
		if (url) anchor.attr('href', url)
		else anchor.replaceWith(anchor.contents())
	})
	$('table').each((_index, element) => {
		const table = $(element)
		if (!table.find('th').length)
			table
				.find('tr')
				.first()
				.children('td')
				.each((_cellIndex, cell) => {
					$(cell).replaceWith($('<th></th>').append($(cell).contents()))
				})
	})
	// Zhihu code blocks often put the language on the enclosing highlight element.
	$('pre').each((_index, element) => {
		const pre = $(element)
		const classes = `${pre.attr('class') || ''} ${pre.parent().attr('class') || ''} ${pre.find('code').attr('class') || ''}`
		const language = classes.match(/(?:language-|highlight-text-|lang-)([\w+-]+)/)?.[1] || ''
		const code = $('<code></code>')
			.text(pre.text())
			.attr('class', language ? `language-${language}` : '')
		pre.empty().append(code)
	})
	const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
	$('[data-tex]').each((_index, element) => {
		const math = $(element)
		if (!math.text().trim()) math.text(math.attr('data-tex') || '')
		if (math.attr('data-type') === 'block' || math.hasClass('ztext-math-block')) math.attr('data-display', 'block')
	})
	converter.use([tables, strikethrough, taskListItems])
	converter.addRule('math', {
		filter: node => node.hasAttribute('data-tex'),
		replacement: (_content, node) =>
			node.getAttribute('data-display') === 'block' ? `\n\n$$\n${node.getAttribute('data-tex')}\n$$\n\n` : `$${node.getAttribute('data-tex')}$`
	})
	converter.addRule('fenced-code', {
		filter: 'pre',
		replacement: (_content, node) => {
			const code = node.firstChild as HTMLElement | null
			const text = node.textContent || ''
			const language = code?.getAttribute('class')?.replace('language-', '') || ''
			const longest = Math.max(2, ...(text.match(/`+/g) || []).map(run => run.length))
			const fence = '`'.repeat(longest + 1)
			return `\n\n${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}\n\n`
		}
	})
	return converter.turndown($('body').html() || '').trim()
}

export function sourceNote(source: string, author: string, date: string | null) {
	const escape = (value: string) => value.replace(/[\\`*_{}\[\]<>]/g, '\\$&').replace(/\s+/g, ' ')
	return `> 来源：[原文链接](${httpUrl(source).href})${author ? ` · 作者：${escape(author)}` : ''}${date ? ` · 原文发布：${date.slice(0, 10)}` : ''}\n\n`
}
