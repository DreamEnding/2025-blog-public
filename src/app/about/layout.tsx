import { pageMetadata } from '@/lib/site-metadata'

export function generateMetadata() {
	return pageMetadata('关于网站', '', '/about')
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
	return children
}
