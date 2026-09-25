import Link from 'next/link'
import { publicSearch } from '@/lib/site-actions'
import { sections } from '@/lib/site-db'

export const dynamic = 'force-dynamic'

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
	const rawQuery = (await searchParams).q
	const query = typeof rawQuery === 'string' ? rawQuery.slice(0, 100) : ''
	const results = publicSearch(query)
	const allSections = sections()
	return (
		<main className='docs-container'>
			<h1>搜索</h1>
			<form className='docs-search' action='/search'>
				<input name='q' defaultValue={query} placeholder='搜索标题、摘要和正文' aria-label='搜索内容' />
				<button type='submit'>搜索</button>
			</form>
			{query &&
				(results.length ? (
					results.map(item => (
						<Link className='docs-list-item' key={item.id} href={`/docs/${item.id}`}>
							<small>{allSections.find(section => section.id === item.section_id)?.name}</small>
							<strong>{item.title}</strong>
							<span>{item.snippet}</span>
						</Link>
					))
				) : (
					<p className='docs-empty'>没有找到已发布内容。</p>
				))}
		</main>
	)
}
