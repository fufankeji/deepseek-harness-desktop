import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTENT_ROOT } from './paths.js'

/**
 * 跨进程互斥锁：串行化「编译 wiki」与「读取 wiki 建图谱」，
 * 防止多个进程（node:test 并行测试文件 / CLI 与 API 并发）同时
 * rmSync + 重建 content/wiki/ 导致 ENOTEMPTY 或读到半成品。
 *
 * 锁以原子创建文件（flag "wx"）实现；仅内容写入方与读取方共用一个锁。
 * 正常路径在 finally 中释放；进程崩溃最多残留锁文件，下次获取超时后
 * 会强制清除并抛错提示重试（本项目为演示场景，编译毫秒级完成）。
 */

const LOCK_PATH = join(CONTENT_ROOT, '.wiki.lock')
const LOCK_TIMEOUT_MS = 30_000
const LOCK_POLL_MS = 20

/** 同步睡眠（Node 主线程禁用 Atomics.wait，改用 hrtime 忙等；锁竞争窗口极短） */
function sleepSync(ms: number): void {
  const end = process.hrtime.bigint() + BigInt(ms) * 1_000_000n
  while (process.hrtime.bigint() < end) {
    // 忙等，毫秒级
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Remove a lock whose recorded owner no longer exists; preserve a live owner's lock. */
function reclaimStaleLock(): boolean {
  let owner: string
  try {
    owner = readFileSync(LOCK_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  const pid = Number(owner.trim())
  if (Number.isSafeInteger(pid) && pid > 0 && processIsAlive(pid)) return false

  // Re-read before removal so a just-replaced lock owned by another process is
  // never deleted based on the stale observation above.
  try {
    if (readFileSync(LOCK_PATH, 'utf8') !== owner) return true
    rmSync(LOCK_PATH, { force: true })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

export function withWikiLock<T>(fn: () => T): T {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' })
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      if (reclaimStaleLock()) continue
      if (Date.now() > deadline) {
        rmSync(LOCK_PATH, { force: true })
        throw new Error(
          `获取编译锁超时（${LOCK_TIMEOUT_MS}ms），已清除残留锁 content/.wiki.lock，请重试`,
        )
      }
      sleepSync(LOCK_POLL_MS)
    }
  }
  try {
    return fn()
  } finally {
    rmSync(LOCK_PATH, { force: true })
  }
}
