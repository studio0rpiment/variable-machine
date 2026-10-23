import fs from 'node:fs/promises'
import path from 'node:path'
import type { WebSocket } from 'ws'
import { WORKSPACE } from './config.ts'
import { print, send } from './hub.ts'
import { scopePath, setRunning } from './run.ts'
import { toolPresent } from './tools.ts'
import { IMAGE_EXT, KINDS, toolModel, type LookTask } from './shared/kinds.ts'
import type { PageOutput } from './shared/events.ts'

/**
 * Commands that run in the page. The image tools are onnxruntime-web models,
 * so the helper (plain Node, no native modules) can't run them itself: it
 * hands the command to an open page, which runs it, uploads what it made into
 * workspace/outputs/, and reports back. Typed and clicked runs take this one
 * path, and the terminal shows it like any other command.
 */

/** Pages that said they can run page commands; the newest one gets the work. */
const runners: WebSocket[] = []
const waiting = new Map<string, { ws: WebSocket; resolve: (ok: boolean) => void; command: string }>()

export function addRunner(ws: WebSocket) {
  if (runners.includes(ws)) return
  runners.push(ws)
  ws.on('close', () => {
    runners.splice(runners.indexOf(ws), 1)
    for (const [id, w] of waiting) {
      if (w.ws !== ws) continue
      print('  the page closed before it finished')
      waiting.delete(id)
      w.resolve(false)
    }
  })
}

let next = 0

function runInPage(words: string[], command: string): Promise<boolean> {
  const ws = runners.at(-1)
  if (!ws) {
    print('  this runs in the page: open Variable Machine in the browser, then run it again')
    return Promise.resolve(false)
  }
  const id = `p${++next}`
  return new Promise((resolve) => {
    waiting.set(id, { ws, resolve, command })
    // ctrl-c: tell the page to drop it, and stop waiting
    const abort = new AbortController()
    abort.signal.addEventListener('abort', () => {
      send(ws, { type: 'page.stop', id })
      waiting.delete(id)
      print('  stopped')
      setRunning(null)
      resolve(false)
    })
    setRunning({ abort })
    send(ws, { type: 'page.run', id, words })
  })
}

/** The page finished: record what it made next to it, then let the queue move on. */
export async function pageDone(id: string, ok: boolean, message: string | undefined, outputs: PageOutput[]) {
  const w = waiting.get(id)
  if (!w) return
  waiting.delete(id)
  setRunning(null)
  if (message) print(`  ${message}`)
  if (ok) {
    for (const o of outputs) {
      const rel = path.relative(WORKSPACE, path.resolve(WORKSPACE, o.path))
      if (!rel.startsWith(`outputs${path.sep}`) || rel.split(path.sep).length !== 3) continue
      await record(rel, o, w.command)
      print(`  ◂ workspace/${rel}`)
    }
  }
  w.resolve(ok)
}

interface OutputsManifest {
  name: string
  kind: 'outputs'
  created: string
  license: string
  inputs: string[]
  command: string
  items: { file: string; from: string; tool: string; command: string; created: string }[]
}

/** outputs/<set>/manifest.json lists every file made into the set, what it was made from, and how. */
async function record(rel: string, o: PageOutput, command: string) {
  const [, set, file] = rel.split(path.sep)
  const file_ = path.join(WORKSPACE, 'outputs', set, 'manifest.json')
  const now = new Date().toISOString()
  let m: OutputsManifest
  try {
    m = JSON.parse(await fs.readFile(file_, 'utf8')) as OutputsManifest
  } catch {
    m = { name: set, kind: 'outputs', created: now, license: await licenseOf(o.from), inputs: [], command, items: [] }
  }
  if (!m.inputs.includes(o.from)) m.inputs.push(o.from)
  m.items = m.items.filter((i) => i.file !== file)
  m.items.push({ file, from: o.from, tool: o.tool, command, created: now })
  m.command = command
  await fs.writeFile(file_, JSON.stringify(m, null, 2) + '\n')
}

/** An output carries the license of the photo it was made from (the image set's manifest). */
async function licenseOf(from: string) {
  try {
    const set = from.split('/').slice(0, 2).join('/')
    const m = JSON.parse(await fs.readFile(path.join(WORKSPACE, set, 'manifest.json'), 'utf8')) as { license?: string }
    return m.license ?? 'as the photo it came from'
  } catch {
    return 'as the photo it came from'
  }
}

const TASKS: LookTask[] = ['cutout', 'depth', 'select']

/**
 * `look <cutout|depth|select> images/<set>/<file> [--point x,y]… [--not x,y]…`
 * Points are in the photo's own pixels. `select` needs at least one --point;
 * --not marks a place that is not part of the thing.
 */
export async function lookCommand(args: string[], line: string): Promise<boolean> {
  const [task, image, ...rest] = args
  const usage = () => (print(`usage: look <${TASKS.join('|')}> images/<set>/<photo> [--point x,y]… [--not x,y]…   (${KINDS.looks.id}: ${KINDS.looks.what})`), false)
  if (!TASKS.includes(task as LookTask) || !image) return usage()
  const t = toolModel(task)!
  const scoped = scopePath(image)
  const rel = scoped ? path.relative('workspace', scoped) : null
  if (!rel || !rel.startsWith(`images${path.sep}`) || rel.split(path.sep).length !== 3 || !IMAGE_EXT.test(rel)) {
    print('look: the photo must be in workspace/images/<set>/ (.jpg, .png or .webp)')
    return false
  }
  try {
    await fs.access(path.join(WORKSPACE, rel))
  } catch {
    print(`no workspace/${rel}`)
    return false
  }
  const points: string[] = []
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--point', '--not'].includes(rest[i]) || !/^\d+,\d+$/.test(rest[i + 1] ?? '')) return usage()
    points.push(rest[i], rest[i + 1])
  }
  if (task === 'select' && !points.includes('--point')) {
    print('look select: say where the thing is with --point x,y (the photo\'s pixels)')
    return false
  }
  if (!(await toolPresent(t))) {
    print(`look ${task} needs its model first: model get ${t.name} (${t.repo}, ${t.license}, about ${t.mb} MB)`)
    return false
  }
  print(`\x1b[2m  runs in the page: ${t.repo} with onnxruntime-web${t.needs === 'webgpu' ? ' (needs WebGPU)' : ''}\x1b[22m`)
  return runInPage(['look', task, rel.split(path.sep).join('/'), ...points], line)
}
