'use client'

// Keep the old editor's file-based interface while storing its changes locally.
const blobs = new Map<string, string>()
let blobId = 0

export type TreeItem = {
	path: string
	mode: '100644' | '100755' | '040000' | '160000' | '120000'
	type: 'blob' | 'tree' | 'commit'
	content?: string
	sha?: string | null
}

export function toBase64Utf8(input: string) {
	const bytes = new TextEncoder().encode(input)
	let binary = ''
	for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
	return btoa(binary)
}

async function save(files: { path: string; content?: string; delete?: boolean }[]) {
	const response = await fetch('/api/legacy', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ files })
	})
	if (!response.ok) {
		const data = await response.json().catch(() => ({}))
		throw new Error(data.error || '本地保存失败')
	}
}

export async function getFileSha(_token: string, _owner: string, _repo: string, filePath: string, _branch: string) {
	const response = await fetch(`/api/legacy?path=${encodeURIComponent(filePath)}`)
	return response.ok ? 'local' : undefined
}

export async function putFile(_token: string, _owner: string, _repo: string, filePath: string, contentBase64: string, _message: string, _branch: string) {
	await save([{ path: filePath, content: contentBase64 }])
	return { content: { sha: 'local' } }
}

export async function getRef(_token: string, _owner: string, _repo: string, _ref: string): Promise<{ sha: string }> {
	return { sha: 'local' }
}

export async function createBlob(_token: string, _owner: string, _repo: string, content: string, encoding: 'utf-8' | 'base64' = 'base64') {
	const sha = `local-${++blobId}`
	blobs.set(sha, encoding === 'base64' ? content : toBase64Utf8(content))
	return { sha }
}

export async function createTree(_token: string, _owner: string, _repo: string, tree: TreeItem[], _baseTree?: string): Promise<{ sha: string }> {
	const files = tree.map(item => {
		if (item.sha === null) return { path: item.path, delete: true }
		const content = item.content !== undefined ? toBase64Utf8(item.content) : blobs.get(item.sha || '')
		if (!content) throw new Error(`文件内容缺失: ${item.path}`)
		return { path: item.path, content }
	})
	await save(files)
	for (const item of tree) if (item.sha) blobs.delete(item.sha)
	return { sha: 'local' }
}

export async function createCommit(_token: string, _owner: string, _repo: string, _message: string, _tree: string, _parents: string[]) {
	return { sha: 'local' }
}

export async function updateRef(_token: string, _owner: string, _repo: string, _ref: string, _sha: string, _force = false) {}

export async function readTextFileFromRepo(_token: string, _owner: string, _repo: string, filePath: string, _ref: string): Promise<string | null> {
	const response = await fetch(`/api/legacy?path=${encodeURIComponent(filePath)}`, { cache: 'no-store' })
	if (response.status === 404) return null
	if (!response.ok) throw new Error('读取本地内容失败')
	return response.text()
}

export async function listRepoFilesRecursive(_token: string, _owner: string, _repo: string, filePath: string, _ref: string): Promise<string[]> {
	const response = await fetch(`/api/legacy?prefix=${encodeURIComponent(filePath)}`, { cache: 'no-store' })
	if (!response.ok) throw new Error('读取本地目录失败')
	return (await response.json()).files
}
