import defaults from '../config/site-content.json'
import { db, settings } from './site-db'

export function siteConfig() {
	const row = db().prepare('SELECT content, deleted FROM legacy_files WHERE path = ?').get('src/config/site-content.json') as
		| { content: Buffer | null; deleted: number }
		| undefined
	const saved = row?.content && !row.deleted ? (JSON.parse(row.content.toString('utf8')) as typeof defaults) : undefined
	const previous = settings()
	return {
		...defaults,
		...saved,
		logo: saved?.logo ?? previous.logo ?? defaults.logo,
		analyticsId: saved?.analyticsId ?? defaults.analyticsId,
		meta: {
			...defaults.meta,
			...saved?.meta,
			title: saved?.meta?.title ?? previous.name ?? defaults.meta.title,
			description: saved?.meta?.description ?? previous.intro ?? defaults.meta.description
		}
	}
}

export function siteSettings() {
	const config = siteConfig()
	const stored = settings()
	return {
		name: config.meta.title,
		username: config.meta.username,
		logo: config.logo,
		intro: config.meta.description,
		consoleUrl: stored.consoleUrl || '',
		apiKeyUrl: stored.apiKeyUrl || '',
		githubUrl: config.socialButtons.find(button => button.type === 'github')?.value || '',
		email: config.socialButtons.find(button => button.type === 'email')?.value || '',
		juejinUrl: config.socialButtons.find(button => button.type === 'juejin')?.value || '',
		analyticsId: config.analyticsId
	}
}
