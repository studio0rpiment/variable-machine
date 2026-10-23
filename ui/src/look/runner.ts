import { onEvent, sendEvent } from '../lib/helper'
import type { LookRun } from './tools'

/**
 * The page's side of page runs (helper/src/pagerun.ts): the helper hands this
 * page a `look …` command, the page runs the model, uploads the PNG into
 * workspace/outputs/ and says it's done. The helper then records it and the
 * terminal shows it. Loaded once by main.tsx, whatever tab is showing; the
 * models' runtime is loaded only when the first run arrives.
 */

export type LookState = { id: string; run: LookRun; phase: 'running' } | { id: string; run: LookRun; phase: 'done'; out: string; ms: number } | { id: string; run: LookRun; phase: 'failed'; error: string }

const listeners = new Set<(s: LookState) => void>()
/** Follow page runs as they start and finish (the Look tab shows them). */
export function onLook(fn: (s: LookState) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const tell = (s: LookState) => listeners.forEach((l) => l(s))

const dropped = new Set<string>()

onEvent(async (e) => {
  if (e.type === 'page.stop') dropped.add(e.id)
  if (e.type !== 'page.run') return
  // onnxruntime-web is large: loaded the first time a tool runs, not with the app
  const { outputPath, parseLook, runLook } = await import('./tools')
  const run = parseLook(e.words)
  if (!run) return sendEvent({ type: 'page.done', id: e.id, ok: false, message: `this page can't run: ${e.words.join(' ')}`, outputs: [] })
  tell({ id: e.id, run, phase: 'running' })
  const t0 = performance.now()
  try {
    const png = await runLook(run)
    if (dropped.delete(e.id)) return
    const out = outputPath(run)
    const res = await fetch(`/api/workspace/output?path=${encodeURIComponent(out)}`, { method: 'POST', body: png })
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `upload failed (${res.status})`)
    const ms = Math.round(performance.now() - t0)
    tell({ id: e.id, run, phase: 'done', out, ms })
    sendEvent({ type: 'page.done', id: e.id, ok: true, message: `${run.task} took ${(ms / 1000).toFixed(1)}s`, outputs: [{ path: out, from: run.from, tool: run.task }] })
  } catch (err) {
    const error = (err as Error).message
    tell({ id: e.id, run, phase: 'failed', error })
    sendEvent({ type: 'page.done', id: e.id, ok: false, message: `${run.task} failed: ${error}`, outputs: [] })
  }
})
