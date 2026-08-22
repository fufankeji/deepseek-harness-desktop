/** Supervise the loopback Web Host used by the first desktop application. */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

const READINESS_PREFIX = 'dsh web: '
const DEFAULT_READINESS_TIMEOUT_MS = 90_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const MAX_STARTUP_OUTPUT_CHARS = 32_768

/** Incremental parser for the Web Host's canonical readiness line. */
export interface ReadinessParser {
  /**
   * Consume one stdout chunk.
   * @param chunk - Text emitted by the Host.
   * @returns The loopback URL once a complete readiness line is observed.
   */
  push(chunk: string): string | undefined
  /**
   * Finish the stream and require a readiness line.
   * @returns The parsed loopback URL.
   */
  finalize(): string
}

/** Assert and normalize one readiness line. */
function parseReadinessLine(line: string): string | undefined {
  if (!line.startsWith(READINESS_PREFIX)) return undefined
  const token = line.slice(READINESS_PREFIX.length).split(/\s/u, 1)[0]
  if (token === undefined) throw new Error(`desktop Host readiness line has no URL: ${line}`)

  let url: URL
  try {
    url = new URL(token)
  } catch {
    throw new Error(`desktop Host readiness URL is invalid: ${token}`)
  }
  const port = Number(url.port)
  if (url.protocol !== 'http:'
    || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535) {
    throw new Error(`desktop Host readiness URL must be loopback HTTP with an explicit port: ${token}`)
  }
  return url.origin
}

/**
 * Create a line parser whose result is stable after readiness.
 * @returns A fresh incremental parser.
 */
export function createReadinessParser(): ReadinessParser {
  let pending = ''
  let readyUrl: string | undefined

  const accept = (line: string): string | undefined => {
    const parsed = parseReadinessLine(line.replace(/\r$/u, ''))
    if (parsed === undefined) return undefined
    if (readyUrl !== undefined && parsed !== readyUrl) {
      throw new Error(`desktop Host emitted conflicting readiness URLs: ${readyUrl} and ${parsed}`)
    }
    readyUrl = parsed
    return readyUrl
  }

  return {
    push(chunk) {
      pending += chunk
      for (;;) {
        const newline = pending.indexOf('\n')
        if (newline === -1) return readyUrl
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        const parsed = accept(line)
        if (parsed !== undefined) return parsed
      }
    },
    finalize() {
      if (pending !== '') accept(pending)
      if (readyUrl === undefined) throw new Error('desktop Host exited before emitting its readiness URL')
      return readyUrl
    },
  }
}

/** Child process operations the supervisor owns. */
export interface HostChild {
  readonly pid?: number
  readonly stdout: { onData(listener: (chunk: string) => void): () => void }
  readonly stderr: { onData(listener: (chunk: string) => void): () => void }
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void
  onError(listener: (error: Error) => void): () => void
  kill(signal: 'SIGTERM' | 'SIGKILL'): void
}

/** Configuration and platform operations for one Host supervisor. */
export interface HostSupervisorOptions {
  /** Spawn one Host process. */
  readonly spawnHost: () => HostChild
  /** Maximum startup time before the Host is terminated. */
  readonly readinessTimeoutMs?: number
  /** Grace after SIGTERM before SIGKILL. */
  readonly shutdownTimeoutMs?: number
  /** Receives bounded Host output for desktop diagnostics. */
  readonly log?: (line: string) => void
  /** Called when a ready Host exits outside an application-owned shutdown. */
  readonly onUnexpectedExit?: (detail: HostUnexpectedExit) => void
}

/** Public identity of one ready Host generation. */
export interface HostGeneration {
  /** Monotonically increasing identity assigned when the child is spawned. */
  readonly id: number
  /** Loopback origin emitted by this generation's readiness line. */
  readonly origin: string
}

/** Detail reported when the currently owned ready generation exits by itself. */
interface HostUnexpectedExit extends HostGeneration {
  /** Child exit code, when the operating system supplied one. */
  readonly code: number | null
  /** Child termination signal, when the operating system supplied one. */
  readonly signal: NodeJS.Signals | null
}

/** Handle for the desktop-owned Host generations. */
export interface HostSupervisor {
  /** The ready generation currently owned by the desktop, if any. */
  readonly current: HostGeneration | undefined
  /** Start one generation, or join the in-flight/current start. */
  start(): Promise<string>
  /** Stop the current generation, run an optional owned change, then start its replacement. */
  restart(reason: string, beforeStart?: () => Promise<void>): Promise<HostGeneration>
  /** Permanently close the supervisor and stop its final generation. */
  shutdown(): Promise<void>
}

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

type StopOwner = { readonly kind: 'restart'; readonly reason: string } | { readonly kind: 'shutdown' }

interface HostGenerationState {
  readonly id: number
  readonly child: HostChild
  readonly readiness: Deferred<string>
  readonly exited: Deferred<void>
  readonly parser: ReadinessParser
  readonly startupCleanups: Array<() => void>
  origin?: string
  output: string
  readinessSettled: boolean
  exitedSettled: boolean
  stopOwner?: StopOwner
  stopPromise?: Promise<void>
  readinessTimer?: ReturnType<typeof setTimeout>
}

/**
 * Create a single-owner, multi-generation Host supervisor.
 * @param options - Child-process operations and bounded lifecycle timings.
 * @returns A supervisor that coalesces starts and shutdowns while serializing restarts.
 */
export function createHostSupervisor(options: HostSupervisorOptions): HostSupervisor {
  const readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
  let active: HostGenerationState | undefined
  let nextGenerationId = 0
  let permanentlyClosed = false
  let restartQueue: Promise<void> = Promise.resolve()
  let shutdownPromise: Promise<void> | undefined

  const cleanupStartup = (state: HostGenerationState): void => {
    if (state.readinessTimer !== undefined) clearTimeout(state.readinessTimer)
    delete state.readinessTimer
    for (const dispose of state.startupCleanups.splice(0)) dispose()
  }

  const appendOutput = (state: HostGenerationState, chunk: string): void => {
    state.output = `${state.output}${chunk}`.slice(-MAX_STARTUP_OUTPUT_CHARS)
    options.log?.(chunk)
  }

  const failReadiness = (state: HostGenerationState, error: unknown): void => {
    if (state.readinessSettled) return
    state.readinessSettled = true
    cleanupStartup(state)
    const diagnostic = state.output === '' ? '' : `\nHost output:\n${state.output}`
    state.readiness.reject(new Error(`${error instanceof Error ? error.message : String(error)}${diagnostic}`))
  }

  const settleExit = (
    state: HostGenerationState,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    if (state.exitedSettled) return
    state.exitedSettled = true
    state.exited.resolve(undefined)
    if (!state.readinessSettled) {
      failReadiness(
        state,
        new Error(`desktop Host exited before readiness (code ${String(code)}, signal ${String(signal)})`),
      )
    }
    if (active !== state) return
    active = undefined
    if (state.origin !== undefined && state.stopOwner === undefined) {
      options.onUnexpectedExit?.({ id: state.id, origin: state.origin, code, signal })
    }
  }

  const createGeneration = (): HostGenerationState => {
    const child = options.spawnHost()
    const state: HostGenerationState = {
      id: ++nextGenerationId,
      child,
      readiness: deferred<string>(),
      exited: deferred<void>(),
      parser: createReadinessParser(),
      startupCleanups: [],
      output: '',
      readinessSettled: false,
      exitedSettled: false,
    }
    active = state

    const acceptChunk = (chunk: string): void => {
      appendOutput(state, chunk)
      try {
        const origin = state.parser.push(chunk)
        if (origin === undefined || state.readinessSettled) return
        state.readinessSettled = true
        state.origin = origin
        cleanupStartup(state)
        state.readiness.resolve(origin)
      } catch (error) {
        failReadiness(state, error)
        child.kill('SIGTERM')
      }
    }

    state.readinessTimer = setTimeout(() => {
      failReadiness(state, new Error(`desktop Host readiness timed out after ${String(readinessTimeoutMs)}ms`))
      child.kill('SIGTERM')
    }, readinessTimeoutMs)
    state.startupCleanups.push(child.stdout.onData(acceptChunk))
    state.startupCleanups.push(child.stderr.onData((chunk) => { appendOutput(state, chunk) }))
    child.onError((error) => {
      failReadiness(state, new Error(`desktop Host failed to spawn: ${error.message}`))
      settleExit(state, null, null)
    })
    child.onExit((code, signal) => {
      settleExit(state, code, signal)
    })
    return state
  }

  const stopGeneration = (state: HostGenerationState, owner: StopOwner): Promise<void> => {
    if (state.stopPromise !== undefined) return state.stopPromise
    state.stopOwner = owner
    state.stopPromise = (async () => {
      if (state.exitedSettled) return
      state.child.kill('SIGTERM')
      let timer: ReturnType<typeof setTimeout> | undefined
      const outcome = await Promise.race([
        state.exited.promise.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => { resolve('timeout') }, shutdownTimeoutMs)
        }),
      ])
      if (timer !== undefined) clearTimeout(timer)
      if (outcome === 'timeout') {
        state.child.kill('SIGKILL')
        await state.exited.promise
      }
    })()
    return state.stopPromise
  }

  const start = (): Promise<string> => {
    if (permanentlyClosed) return Promise.reject(new Error('desktop Host cannot start after shutdown'))
    if (active !== undefined) return active.readiness.promise
    try {
      return createGeneration().readiness.promise
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const assertRestartOpen = (): void => {
    if (permanentlyClosed) throw new Error('desktop Host cannot restart after shutdown')
  }

  const restart = (reason: string, beforeStart?: () => Promise<void>): Promise<HostGeneration> => {
    if (permanentlyClosed) return Promise.reject(new Error('desktop Host cannot restart after shutdown'))
    const operation = restartQueue.then(async () => {
      assertRestartOpen()
      const previous = active
      if (previous !== undefined) await stopGeneration(previous, { kind: 'restart', reason })
      assertRestartOpen()
      await beforeStart?.()
      assertRestartOpen()
      const next = createGeneration()
      const origin = await next.readiness.promise
      return { id: next.id, origin }
    })
    restartQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise
    permanentlyClosed = true
    const generationAtShutdown = active
    const initialStop = generationAtShutdown === undefined
      ? Promise.resolve()
      : stopGeneration(generationAtShutdown, { kind: 'shutdown' })
    shutdownPromise = (async () => {
      await initialStop
      await restartQueue
      const finalGeneration = active
      if (finalGeneration !== undefined && finalGeneration !== generationAtShutdown) {
        await stopGeneration(finalGeneration, { kind: 'shutdown' })
      }
    })()
    return shutdownPromise
  }

  return {
    get current() {
      if (active?.origin === undefined) return undefined
      return { id: active.id, origin: active.origin }
    },
    start,
    restart,
    shutdown,
  }
}

/** Options for the real `dsh web` child. */
export interface SpawnDshWebOptions {
  /** Node-compatible executable selected by the desktop app. */
  readonly nodeExecutable: string
  /** Built dsh CLI entry. */
  readonly cliEntry: string
  /** Working directory inherited by user-created sessions and tools. */
  readonly cwd: string
  /** Frozen environment for the Host process. */
  readonly env: NodeJS.ProcessEnv
  /** Run the Electron executable as its bundled Node runtime. */
  readonly electronRunAsNode?: boolean
}

function streamAdapter(stream: NodeJS.ReadableStream): HostChild['stdout'] {
  return {
    onData(listener) {
      const accept = (chunk: string | Buffer): void => { listener(chunk.toString()) }
      stream.on('data', accept)
      return () => { stream.off('data', accept) }
    },
  }
}

/**
 * Spawn the production Web Host on an OS-assigned loopback port.
 * @param options - Node runtime, built CLI and process environment.
 * @returns The child handle consumed by {@link createHostSupervisor}.
 */
export function spawnDshWeb(options: SpawnDshWebOptions): HostChild {
  const env = options.electronRunAsNode
    ? { ...options.env, ELECTRON_RUN_AS_NODE: '1' }
    : options.env
  const process = spawn(options.nodeExecutable, [
    '--expose-internals',
    options.cliEntry,
    'web',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
  ], {
    cwd: options.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  return nodeChildAdapter(process)
}

/** Adapt Node's event overloads to the supervisor's explicit ownership API. */
function nodeChildAdapter(child: ChildProcessByStdio<null, Readable, Readable>): HostChild {
  return {
    ...(child.pid === undefined ? {} : { pid: child.pid }),
    stdout: streamAdapter(child.stdout),
    stderr: streamAdapter(child.stderr),
    onExit(listener) {
      child.on('exit', listener)
      return () => { child.off('exit', listener) }
    },
    onError(listener) {
      child.on('error', listener)
      return () => { child.off('error', listener) }
    },
    kill(signal) {
      child.kill(signal)
    },
  }
}
