async function session() {
	const response = await fetch('/api/legacy?session=1', { cache: 'no-store' })
	return response.ok && (await response.json()).authenticated === true
}

export async function hasAuth() {
	return session()
}

export async function getAuthToken() {
	if (!(await session())) {
		window.location.assign(`/admin?next=${encodeURIComponent(window.location.pathname)}`)
		throw new Error('请先登录管理后台')
	}
	return 'local'
}

export function clearAllAuthCache() {
	fetch('/api/manage/logout', { method: 'POST' }).catch(() => {})
}
