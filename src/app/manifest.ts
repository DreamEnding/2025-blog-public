import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/site-config'

export const dynamic = 'force-dynamic'

export default function manifest(): MetadataRoute.Manifest {
	const config = siteConfig()
	return {
		name: config.meta.title,
		short_name: config.meta.title,
		description: config.meta.description,
		start_url: '/',
		display: 'standalone',
		icons: [{ src: '/favicon.png', sizes: 'any', type: 'image/png' }]
	}
}
