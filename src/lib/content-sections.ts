import { entries, sections } from './site-db'

export const contentNames = ['API 文档', '使用教程', 'AI 技术分享'] as const

export function publishedIn(name: (typeof contentNames)[number]) {
	const target = sections().find(section => section.name === name)
	return target ? entries().filter(item => item.section_id === target.id) : []
}

export function recentArticles() {
	const allowed = new Set(
		sections()
			.filter(section => section.name === '使用教程' || section.name === 'AI 技术分享')
			.map(section => section.id)
	)
	return entries()
		.filter(item => allowed.has(item.section_id))
		.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id)
}
