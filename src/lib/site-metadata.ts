import type { Metadata } from 'next'
import { siteConfig } from './site-config'

export function siteUrl() {
	return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:2025').replace(/\/$/, '')
}

export function pageMetadata(title: string, description: string, pathname: string): Metadata {
	const config = siteConfig()
	const fullTitle = title ? `${title} | ${config.meta.title}` : config.meta.title
	const summary = description || config.meta.description
	return {
		metadataBase: new URL(siteUrl()),
		manifest: '/manifest.webmanifest',
		title: fullTitle,
		description: summary,
		alternates: { canonical: pathname },
		openGraph: { title: fullTitle, description: summary, url: pathname, siteName: config.meta.title, locale: 'zh_CN', type: 'website' },
		twitter: { card: 'summary', title: fullTitle, description: summary }
	}
}
