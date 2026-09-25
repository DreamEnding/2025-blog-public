import Card from '@/components/card'
import { useCenterStore } from '@/hooks/use-center'
import { useConfigStore } from './stores/config-store'
import { CARD_SPACING } from '@/consts'
import dayjs from 'dayjs'
import Link from 'next/link'
import { HomeDraggableLayer } from './home-draggable-layer'
import { useEffect, useState } from 'react'

export default function ArticleCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const [blog, setBlog] = useState<{ id: number; title: string; summary: string; published_at: string } | null>(null)
	const [loading, setLoading] = useState(true)
	useEffect(() => {
		fetch('/api/content')
			.then(response => response.json())
			.then(data => setBlog(data.recent[0] || null))
			.finally(() => setLoading(false))
	}, [])
	const styles = cardStyles.articleCard
	const hiCardStyles = cardStyles.hiCard
	const socialButtonsStyles = cardStyles.socialButtons

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x + hiCardStyles.width / 2 - socialButtonsStyles.width - CARD_SPACING - styles.width
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y + hiCardStyles.height / 2 + CARD_SPACING

	return (
		<HomeDraggableLayer cardKey='articleCard' x={x} y={y} width={styles.width} height={styles.height}>
			<Card order={styles.order} width={styles.width} height={styles.height} x={x} y={y} className='space-y-2'>
				{siteContent.enableChristmas && (
					<>
						<img
							src='/images/christmas/snow-9.webp'
							alt='Christmas decoration'
							className='pointer-events-none absolute'
							style={{ width: 140, left: -12, top: -16, opacity: 0.8 }}
						/>
					</>
				)}

				<h2 className='text-secondary text-sm'>最新文章</h2>

				{loading ? (
					<div className='flex h-[60px] items-center justify-center'>
						<span className='text-secondary text-xs'>加载中...</span>
					</div>
				) : blog ? (
					<Link href={`/articles/${blog.id}`} className='flex transition-opacity hover:opacity-80'>
						<div className='text-secondary mr-3 grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/60'>+</div>
						<div className='flex-1'>
							<h3 className='line-clamp-1 text-sm font-medium'>{blog.title}</h3>
							{blog.summary && <p className='text-secondary mt-1 line-clamp-3 text-xs'>{blog.summary}</p>}
							<p className='text-secondary mt-3 text-xs'>{dayjs(blog.published_at).format('YYYY/M/D')}</p>
						</div>
					</Link>
				) : (
					<div className='flex h-[60px] items-center justify-center'>
						<span className='text-secondary text-xs'>暂无文章</span>
					</div>
				)}
			</Card>
		</HomeDraggableLayer>
	)
}
