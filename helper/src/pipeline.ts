import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT } from './config.ts'
import { broadcast, print } from './hub.ts'
import { setRunning, write } from './run.ts'
import { joinWords } from './shared/quote.ts'

/**
 * The pipeline runner (plan §3.1.4). A recipe is a list of steps; each is a
 * real command (spawned without a shell) or a small file write the helper
 * does itself. Every step is announced, echoed with ▸, and its output is
 * streamed line by line to the terminal, to `pipeline.line` events and to the
 * run's log file.
 */

export type Step =
  | { kind: 'spawn'; argv: string[]; env?: Record<string, string>; onLine?: (line: string, runId: string) => void }
  | { kind: 'do'; display: string; run: () => Promise<void> }

export interface Recipe {
  recipe: string
  params: unknown
  steps: Step[]
  /** where log.txt goes, when the recipe keeps one */
  logFile?: string
  /** artifacts it makes, reported in pipeline.finished */
  outputs: string[]
}

let current: { runId: string; stop: () => void } | null = null

export function stopPipeline(runId?: string) {
  if (current && (!runId || runId === current.runId)) current.stop()
}

export const display = (s: Step) =>
  s.kind === 'do' ? s.display : joinWords([...Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${v}`), ...s.argv])

/** Child processes get unbuffered, colourless output so lines arrive as they happen and parse cleanly. */
const CHILD_ENV = { PYTHONUNBUFFERED: '1', NO_COLOR: '1', COLUMNS: '100', HF_HUB_DISABLE_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false' }

export async function runRecipe(r: Recipe): Promise<boolean> {
  const runId = `${r.recipe}-${Date.now().toString(36)}`
  const commands = r.steps.map(display)
  broadcast({ type: 'pipeline.started', runId, recipe: r.recipe, params: r.params, commands })
  const log = async (text: string) => {
    if (r.logFile) await fs.appendFile(r.logFile, text).catch(() => {})
  }
  let stopped = false
  let ok = true
  for (const [index, step] of r.steps.entries()) {
    const shown = display(step)
    broadcast({ type: 'pipeline.step', runId, index, command: shown })
    print(`▸ ${shown}`)
    await log(`$ ${shown}\n`)
    if (step.kind === 'do') {
      try {
        await step.run()
      } catch (err) {
        print(`  ${(err as Error).message}`)
        ok = false
      }
    } else {
      ok = await new Promise<boolean>((resolve) => {
        const child = spawn(step.argv[0], step.argv.slice(1), { cwd: ROOT, shell: false, env: { ...process.env, ...CHILD_ENV, ...step.env } })
        current = {
          runId,
          stop: () => {
            stopped = true
            child.kill('SIGINT')
          },
        }
        setRunning({ child })
        // tqdm redraws with \r; treat those as line ends too so progress shows up live.
        const pipe = (stream: 'stdout' | 'stderr') => {
          let buf = ''
          return (b: Buffer) => {
            const text = b.toString('utf8')
            write(text)
            void log(text)
            buf += text
            const parts = buf.split(/\r?\n|\r/)
            buf = parts.pop() ?? ''
            for (const line of parts) {
              if (!line.trim()) continue
              broadcast({ type: 'pipeline.line', runId, stream, text: line })
              step.onLine?.(line, runId)
            }
          }
        }
        child.stdout.on('data', pipe('stdout'))
        child.stderr.on('data', pipe('stderr'))
        child.on('error', (err) => print(`${step.argv[0]}: ${err.message}`))
        child.on('close', (code) => {
          current = null
          setRunning(null)
          resolve(code === 0 && !stopped)
        })
      })
    }
    if (!ok) break
  }
  print(ok ? `  ◂ ${r.recipe} done${r.outputs.length ? ` · ${r.outputs.join(' · ')}` : ''}` : stopped ? `  ◂ ${r.recipe} stopped` : `  ◂ ${r.recipe} failed; the lines above say why`)
  broadcast({ type: 'pipeline.finished', runId, ok, outputs: ok ? r.outputs : [] })
  return ok
}

export const relPath = (p: string) => path.relative(ROOT, p)
