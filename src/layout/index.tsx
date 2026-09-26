'use client'
import { PropsWithChildren, useEffect } from 'react'
import { useCenterInit } from '@/hooks/use-center'
import BlurredBubblesBackground from './backgrounds/blurred-bubbles'
import NavCard from '@/components/nav-card'
import { Toaster } from 'sonner'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useSize, useSizeInit } from '@/hooks/use-size'
import { useConfigStore, type CardStyles, type SiteContent } from '@/app/(home)/stores/config-store'
import { ScrollTopButton } from '@/components/scroll-top-button'
import MusicCard from '@/components/music-card'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { loadLegacyJson } from '@/lib/legacy-client'
import { useCenterStore } from '@/hooks/use-center'

export default function Layout({ children, docsSite }: PropsWithChildren<{ docsSite: Record<string, string> }>) {
	const pathname = usePathname()
	useCenterInit()
	useSizeInit()
	useEffect(() => useCenterStore.getState().recalc(), [pathname])
	const { cardStyles, siteContent, regenerateKey, setSiteContent, setCardStyles } = useConfigStore()
	const { maxSM, init } = useSize()
	useEffect(() => {
		loadLegacyJson<SiteContent>('src/config/site-content.json')
			.then(value => {
				setSiteContent(value)
				for (const [key, color] of Object.entries({
					'--color-brand': value.theme.colorBrand,
					'--color-primary': value.theme.colorPrimary,
					'--color-secondary': value.theme.colorSecondary,
					'--color-brand-secondary': value.theme.colorBrandSecondary,
					'--color-bg': value.theme.colorBg,
					'--color-border': value.theme.colorBorder,
					'--color-card': value.theme.colorCard,
					'--color-article': value.theme.colorArticle
				}))
					document.documentElement.style.setProperty(key, color)
			})
			.catch(console.error)
		loadLegacyJson<CardStyles>('src/config/card-styles.json').then(setCardStyles).catch(console.error)
	}, [setSiteContent, setCardStyles])
	if (/^\/(admin|docs|search|sections)(\/|$)/.test(pathname)) {
		return (
			<div className='docs-site'>
				<header className='docs-header'>
					<Link href='/' className='docs-brand'>
						<img src={docsSite.logo || '/images/avatar.png'} alt='' />
						{docsSite.name || 'API 文档'}
					</Link>
					<nav>
						<Link href='/'>← 返回主页</Link>
						<Link href='/search'>搜索</Link>
						{docsSite.consoleUrl && (
							<a href={docsSite.consoleUrl} target='_blank' rel='noreferrer'>
								控制台
							</a>
						)}
						{docsSite.apiKeyUrl && (
							<a href={docsSite.apiKeyUrl} target='_blank' rel='noreferrer'>
								获取 API Key
							</a>
						)}
					</nav>
				</header>
				{children}
			</div>
		)
	}

	const backgroundImages = (siteContent.backgroundImages ?? []) as Array<{ id: string; url: string }>
	const currentBackgroundImageId = siteContent.currentBackgroundImageId
	const currentBackgroundImage =
		currentBackgroundImageId && currentBackgroundImageId.trim() ? backgroundImages.find(item => item.id === currentBackgroundImageId) : null

	return (
		<>
			<Toaster
				position='bottom-right'
				richColors
				icons={{
					success: <CircleCheckIcon className='size-4' />,
					info: <InfoIcon className='size-4' />,
					warning: <TriangleAlertIcon className='size-4' />,
					error: <OctagonXIcon className='size-4' />,
					loading: <Loader2Icon className='size-4 animate-spin' />
				}}
				style={
					{
						'--border-radius': '12px'
					} as React.CSSProperties
				}
			/>
			{currentBackgroundImage && (
				<div
					className='fixed inset-0 z-0 overflow-hidden'
					style={{
						backgroundImage: `url(${currentBackgroundImage.url})`,
						backgroundSize: 'cover',
						backgroundPosition: 'center',
						backgroundRepeat: 'no-repeat'
					}}
				/>
			)}
			<BlurredBubblesBackground colors={siteContent.backgroundColors} regenerateKey={regenerateKey} />

			<main className='site-public-page relative z-10 h-full'>
				{children}
				{pathname !== '/' && (
					<>
						<Link href='/' className='brand-btn fixed top-5 left-5 z-50'>
							← 返回主页
						</Link>
						<NavCard />
					</>
				)}

				{pathname !== '/' && !maxSM && cardStyles.musicCard?.enabled !== false && <MusicCard />}
			</main>

			{pathname !== '/' && maxSM && init && <ScrollTopButton className='bg-brand/20 fixed right-6 bottom-8 z-50 shadow-md' />}
		</>
	)
}
