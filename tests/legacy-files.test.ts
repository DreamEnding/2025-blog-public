import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listLegacyFiles, readLegacyFile, saveLegacyFiles, validLegacyPath } from '../src/lib/legacy-files'
import { resetDbForTests } from '../src/lib/site-db'

test('stores legacy changes in SQLite and rejects paths outside restored content', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'nexus-legacy-test-'))
	const previousDir = process.env.DATA_DIR
	process.env.DATA_DIR = directory
	try {
		assert.equal(validLegacyPath('public/blogs/../secret.txt'), false)
		assert.equal(validLegacyPath('src/app/admin/page.tsx'), false)
		assert.throws(() => saveLegacyFiles([{ path: 'src/app/admin/page.tsx', content: 'e30=' }]), /无效文件路径/)
		assert.throws(() => saveLegacyFiles([{ path: 'public/blogs/test/index.md', content: 'invalid!' }]), /文件内容无效/)

		const filePath = 'public/blogs/local-test/index.md'
		saveLegacyFiles([{ path: filePath, content: Buffer.from('# Local test').toString('base64') }])
		assert.equal((await readLegacyFile(filePath))?.toString(), '# Local test')
		assert.deepEqual(await listLegacyFiles('public/blogs/local-test'), [filePath])

		saveLegacyFiles([{ path: filePath, delete: true }])
		assert.equal(await readLegacyFile(filePath), null)
		assert.deepEqual(await listLegacyFiles('public/blogs/local-test'), [])
	} finally {
		resetDbForTests()
		if (previousDir === undefined) delete process.env.DATA_DIR
		else process.env.DATA_DIR = previousDir
		await rm(directory, { recursive: true, force: true })
	}
})
