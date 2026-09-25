export async function loadLegacyJson<T>(filePath: string): Promise<T> {
	const response = await fetch(`/api/legacy?path=${encodeURIComponent(filePath)}`, { cache: 'no-store' })
	if (!response.ok) throw new Error('读取本地内容失败')
	return response.json()
}
