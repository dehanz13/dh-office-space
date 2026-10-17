// Runs an AI "think" function off the main thread.
//
// Every AI is written as a generator that yields at cheap, regular points
// (between root moves, between replies, between playout batches). That one
// shape serves two hosts:
//   - a module Web Worker, which simply runs the generator to completion;
//   - a chunked fallback for environments without `Worker` (Node, tests),
//     which runs the generator for ~6 ms at a time, then gives the event loop back.

export type Think<Req, Res> = (req: Req) => Generator<void, Res, void>

interface WorkerReply<Res> { id: number; res?: Res; error?: string }

const SLICE_MS = 6

/** Run a think generator in small time slices on the current thread. */
export function runChunked<Res>(gen: Generator<void, Res, void>, sliceMs = SLICE_MS): Promise<Res> {
  return new Promise<Res>((resolve, reject) => {
    const step = () => {
      const t0 = performance.now()
      try {
        for (;;) {
          const r = gen.next()
          if (r.done) {
            resolve(r.value)
            return
          }
          if (performance.now() - t0 >= sliceMs) break
        }
      } catch (err) {
        reject(err)
        return
      }
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
  })
}

/** Run a think generator to completion (used inside the worker). */
export function runToEnd<Res>(gen: Generator<void, Res, void>): Res {
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
  }
}

/**
 * Owns one lazily created worker per game instance. If `Worker` does not
 * exist, or the worker fails to load, it falls back to `runChunked`.
 */
export class AIRunner<Req, Res> {
  private worker: Worker | null = null
  private broken = false
  private seq = 0
  private pending = new Map<number, { req: Req; resolve: (r: Res) => void; reject: (e: unknown) => void }>()
  private readonly spawn: () => Worker
  private readonly think: Think<Req, Res>

  constructor(spawn: () => Worker, think: Think<Req, Res>) {
    this.spawn = spawn
    this.think = think
  }

  run(req: Req): Promise<Res> {
    const worker = this.ensureWorker()
    if (!worker) return runChunked(this.think(req))
    const id = ++this.seq
    return new Promise<Res>((resolve, reject) => {
      this.pending.set(id, { req, resolve, reject })
      worker.postMessage({ id, req })
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker
    if (this.broken || typeof Worker === 'undefined') return null
    try {
      const w = this.spawn()
      w.onmessage = (e: MessageEvent<WorkerReply<Res>>) => {
        const job = this.pending.get(e.data.id)
        if (!job) return
        this.pending.delete(e.data.id)
        if (e.data.error !== undefined) job.reject(new Error(e.data.error))
        else job.resolve(e.data.res as Res)
      }
      w.onerror = (e: ErrorEvent) => {
        // The worker script failed (e.g. could not load). Finish every
        // pending job on the main thread in small chunks instead.
        e.preventDefault()
        this.broken = true
        this.dispose()
        const jobs = [...this.pending.values()]
        this.pending.clear()
        for (const job of jobs) runChunked(this.think(job.req)).then(job.resolve, job.reject)
      }
      this.worker = w
      return w
    } catch {
      this.broken = true
      return null
    }
  }
}

/** Installs the message handler inside a worker module. */
export function serveWorker<Req, Res>(think: Think<Req, Res>): void {
  const scope = self as unknown as {
    onmessage: ((e: MessageEvent<{ id: number; req: Req }>) => void) | null
    postMessage(msg: WorkerReply<Res>): void
  }
  scope.onmessage = (e) => {
    const { id, req } = e.data
    try {
      scope.postMessage({ id, res: runToEnd(think(req)) })
    } catch (err) {
      scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
