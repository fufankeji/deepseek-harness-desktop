import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const runtimeRoot = mkdtempSync(join(tmpdir(), 'llmwiki-lock-'))
mkdirSync(join(runtimeRoot, 'content'), { recursive: true })
process.env.LLMWIKI_RUNTIME_ROOT = runtimeRoot

const { withWikiLock } = await import('../src/wiki/lock.js')
const lockPath = join(runtimeRoot, 'content', '.wiki.lock')

after(() => { rmSync(runtimeRoot, { recursive: true, force: true }) })

test('reclaims a stale compilation lock before running the protected operation', () => {
  writeFileSync(lockPath, 'not-a-live-pid')
  let ran = false

  const result = withWikiLock(() => {
    ran = true
    return 'ready'
  })

  assert.equal(result, 'ready')
  assert.equal(ran, true)
  assert.equal(existsSync(lockPath), false)
})
