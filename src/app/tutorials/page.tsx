import { PublicMarkdown } from '@/components/public-markdown'
import { publishedIn } from '@/lib/content-sections'
import { pageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
	const tutorial = publishedIn('使用教程')[0]
	return pageMetadata(tutorial?.public_title || '使用教程', tutorial?.public_summary || '', '/tutorials')
}

export default function TutorialsPage() {
	const tutorial = publishedIn('使用教程')[0]
	return (
		<main className='docs-container tutorial-page'>
			{tutorial ? (
				<>
					<header className='tutorial-header'>
						<p className='tutorial-kicker'>使用教程 / NEXUS AI</p>
						<h1>{tutorial.public_title}</h1>
						<p>{tutorial.public_summary}</p>
					</header>
					<PublicMarkdown body={tutorial.public_body || ''} tutorial />
				</>
			) : (
				<p className='docs-empty'>教程即将发布。</p>
			)}
		</main>
	)
}
