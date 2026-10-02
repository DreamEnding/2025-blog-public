import '@/styles/globals.css'
import '@/styles/docs.css'

import type { Viewport } from 'next'
import Layout from '@/layout'
import Head from '@/layout/head'
import siteContent from '@/config/site-content.json'
import { siteConfig, siteSettings } from '@/lib/site-config'
import { pageMetadata } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

const { theme } = siteContent

export function generateMetadata() {
	return pageMetadata('', '', '/')
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

const htmlStyle = {
	cursor: 'url(/images/cursor.svg) 2 1, auto',
	'--color-brand': theme.colorBrand,
	'--color-primary': theme.colorPrimary,
	'--color-secondary': theme.colorSecondary,
	'--color-brand-secondary': theme.colorBrandSecondary,
	'--color-bg': theme.colorBg,
	'--color-border': theme.colorBorder,
	'--color-card': theme.colorCard,
	'--color-article': theme.colorArticle
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const config = siteConfig()
	const docsSite = siteSettings()
	return (
		<html lang='zh-CN' suppressHydrationWarning style={htmlStyle}>
			<Head analyticsId={config.analyticsId} />

			<body>
				<script
					dangerouslySetInnerHTML={{
						__html: `
					if (/windows|win32/i.test(navigator.userAgent)) {
						document.documentElement.classList.add('windows');
					}
		      `
					}}
				/>

				<Layout docsSite={docsSite} initialSiteContent={config}>
					{children}
				</Layout>
			</body>
		</html>
	)
}
