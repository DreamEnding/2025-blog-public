import { NextConfig } from 'next'

const nextConfig: NextConfig = {
	output: 'standalone',
	serverExternalPackages: ['better-sqlite3'],
	devIndicators: false,
	reactStrictMode: false,
	reactCompiler: true,
	pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
	experimental: {
		scrollRestoration: false
	},
	turbopack: {
		rules: {
			'*.svg': {
				loaders: ['@svgr/webpack'],
				as: '*.js'
			}
		}
	},
	webpack: config => {
		config.module.rules.push({
			test: /\.svg$/i,
			use: [{ loader: '@svgr/webpack', options: { svgo: false } }]
		})
		return config
	},
	async rewrites() {
		return {
			beforeFiles: [
				{ source: '/blogs/:path*', destination: '/api/legacy?path=public/blogs/:path*' },
				{ source: '/images/:path*', destination: '/api/legacy?path=public/images/:path*' },
				{ source: '/favicon.png', destination: '/api/legacy?path=public/favicon.png' }
			]
		}
	},

	async redirects() {
		return [
			{
				source: '/zh',
				destination: '/',
				permanent: true
			},
			{
				source: '/en',
				destination: '/',
				permanent: true
			}
		]
	}
}

export default nextConfig
