import { DocsMarkdown } from '@/components/docs-markdown'
import { publishedIn } from '@/lib/content-sections'

export const dynamic = 'force-dynamic'

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
					<DocsMarkdown body={tutorial.public_body || ''} tutorial />
				</>
			) : (
				<p className='docs-empty'>教程即将发布。</p>
			)}
		</main>
	)
}
