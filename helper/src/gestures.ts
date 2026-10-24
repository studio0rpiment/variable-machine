import fs from 'node:fs/promises'
import path from 'node:path'
import type http from 'node:http'
import { WORKSPACE } from './config.ts'
import { broadcast, print } from './hub.ts'
import { OSC_ADDRESS, sendOsc } from './osc.ts'
import { POINTS, train, type Check, type Example, type Tracker } from './shared/gesture.ts'

/**
 * `gesture …` (the Move tab). A gesture set is workspace/gestures/<name>/:
 * examples.jsonl (one {"label","v"} per recorded moment: the shape of the
 * points, never a camera frame), model.json once trained, and manifest.json.
 *
 *   gesture new <name> --tracker hands|body
 *   gesture train <name> [--k 5]          check on every fifth example, then keep them all
 *   gesture clear <name> <label>          forget one gesture's examples
 *   gesture send <name> --port 9000 [--address /vm/<name>]   while testing, OSC to this computer
 *   gesture send <name> --stop
 *   osc send <port> <address> [values…]   one OSC message, to try a connection
 *
 * Examples arrive from the page (POST /api/workspace/gesture), announced in
 * the terminal like a photo upload.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const LABEL = /^[\w .-]{1,40}$/
const dir = (name: string) => path.join(WORKSPACE, 'gestures', name)
const now = () => new Date().toISOString()

export interface GestureManifest {
  name: string
  kind: 'gesture'
  created: string
  license: string
  inputs: string[]
  command: string[]
  tracker: Tracker
  counts: Record<string, number>
  trained?: { at: string; k: number; examples: number; check: Check }
}

async function readManifest(name: string): Promise<GestureManifest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(name), 'manifest.json'), 'utf8')) as GestureManifest
  } catch {
    return null
  }
}

async function writeManifest(m: GestureManifest) {
  await fs.writeFile(path.join(dir(m.name), 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
  broadcast({ type: 'workspace.changed', path: `gestures/${m.name}/manifest.json`, kind: 'change' })
}

async function readExamples(name: string): Promise<Example[]> {
  const text = await fs.readFile(path.join(dir(name), 'examples.jsonl'), 'utf8').catch(() => '')
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Example)
}

const record = (m: GestureManifest, line: string) => m.command.at(-1) !== line && m.command.push(line)

function flags(words: string[]) {
  const pos: string[] = []
  const opts: Record<string, string> = {}
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith('--')) opts[words[i].slice(2)] = words[i + 1]?.startsWith('--') || words[i + 1] === undefined ? '' : words[++i]
    else pos.push(words[i])
  }
  return { pos, opts }
}

/** The gesture set the page's live test is sent on from, and where to. */
const sending = new Map<string, { port: number; address: string }>()

/** A live guess from the page's test, sent on as OSC when `gesture send` is on for that set. Not echoed: it happens many times a second. */
export function gestureLive(name: string, label: string, confidence: number) {
  const to = sending.get(name)
  if (to && LABEL.test(label) && Number.isFinite(confidence)) sendOsc(to.port, to.address, [label, confidence])
}

/** POST /api/workspace/gesture?name=<set>&label=<label> with {"vectors": [[…], …]}: examples from the page. */
export async function receiveExamples(req: http.IncomingMessage, res: http.ServerResponse, name: string | null, label: string | null) {
  const json = (code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  if (req.method !== 'POST' || !name || !NAME.test(name) || !label || !LABEL.test(label)) return json(400, { error: 'POST {"vectors": [...]} with ?name=<set>&label=<gesture>' })
  const m = await readManifest(name)
  if (!m) return json(404, { error: `no gesture set ${name}: gesture new ${name} --tracker hands` })
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 8 * 2 ** 20) return json(413, { error: 'too many examples at once' })
    chunks.push(c as Buffer)
  }
  let vectors: number[][]
  try {
    vectors = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { vectors: number[][] }).vectors
  } catch {
    return json(400, { error: 'not JSON' })
  }
  const want = POINTS[m.tracker] * 3
  if (!Array.isArray(vectors) || !vectors.length || vectors.some((v) => !Array.isArray(v) || v.length !== want || v.some((x) => !Number.isFinite(x)))) {
    return json(400, { error: `each example is ${want} numbers (${POINTS[m.tracker]} points × x, y, z)` })
  }
  const lines = vectors.map((v) => JSON.stringify({ label, v: v.map((x) => Math.round(x * 1e4) / 1e4) })).join('\n') + '\n'
  await fs.appendFile(path.join(dir(name), 'examples.jsonl'), lines)
  m.counts[label] = (m.counts[label] ?? 0) + vectors.length
  await writeManifest(m)
  print(`▸ recorded ${vectors.length} example${vectors.length > 1 ? 's' : ''} of "${label}" → workspace/gestures/${name}/examples.jsonl (${m.counts[label]} of it now; points only, no pictures)`)
  json(200, { counts: m.counts })
}

async function create(name: string, tracker: string, line: string) {
  if (!NAME.test(name) || (tracker !== 'hands' && tracker !== 'body')) return print('usage: gesture new <name> --tracker hands|body'), false
  if (await readManifest(name)) return print(`gesture: ${name} exists`), false
  await fs.mkdir(dir(name), { recursive: true })
  await fs.writeFile(path.join(dir(name), 'examples.jsonl'), '')
  await writeManifest({ name, kind: 'gesture', created: now(), license: 'your own movements', inputs: [], command: [line], tracker: tracker as Tracker, counts: {} })
  print(`  ◂ workspace/gestures/${name}/ · ${tracker}: record some examples of each gesture on the Move tab`)
  return true
}

async function trainSet(name: string, kText: string | undefined, line: string) {
  const m = await readManifest(name)
  if (!m) return print(`gesture: no set ${name}`), false
  const k = Number(kText ?? 5)
  if (!Number.isInteger(k) || k < 1 || k > 50) return print('gesture train: --k is a whole number from 1 to 50'), false
  const examples = await readExamples(name)
  const labels = Object.keys(m.counts).filter((l) => m.counts[l] > 0)
  if (labels.length < 2) return print('gesture train: record at least two gestures first (it tells gestures apart)'), false
  const few = labels.filter((l) => m.counts[l] < 5)
  if (few.length) return print(`gesture train: record at least 5 examples of ${few.join(', ')}`), false
  const { model, check } = train(name, m.tracker, examples, k)
  await fs.writeFile(path.join(dir(name), 'model.json'), JSON.stringify(model) + '\n')
  // the confusion grid, made gesture down the side, named gesture across the top
  const w = Math.max(6, ...model.labels.map((l) => l.length)) + 2
  print(`  k-nearest neighbours, k = ${k}: ${examples.length} examples, every fifth set aside to check`)
  print(`  ${'made \\ named'.padEnd(w)}${model.labels.map((l) => l.padStart(w)).join('')}`)
  for (const a of model.labels) print(`  ${a.padEnd(w)}${model.labels.map((b) => String(check.confusion[a][b]).padStart(w)).join('')}`)
  print(`  ${check.correct} of ${check.heldOut} set-aside examples named right${check.heldOut ? ` (${Math.round((check.correct / check.heldOut) * 100)}%)` : ''}`)
  m.trained = { at: now(), k, examples: examples.length, check }
  m.inputs = [`workspace/gestures/${name}/examples.jsonl`]
  record(m, line)
  await writeManifest(m)
  print(`  ◂ workspace/gestures/${name}/model.json`)
  return true
}

async function clear(name: string, label: string, line: string) {
  const m = await readManifest(name)
  if (!m || !LABEL.test(label ?? '')) return print('usage: gesture clear <name> <gesture>'), false
  const kept = (await readExamples(name)).filter((e) => e.label !== label)
  await fs.writeFile(path.join(dir(name), 'examples.jsonl'), kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''))
  delete m.counts[label]
  delete m.trained
  await fs.rm(path.join(dir(name), 'model.json'), { force: true })
  record(m, line)
  await writeManifest(m)
  print(`  ◂ forgot "${label}"; train again`)
  return true
}

async function send(name: string, opts: Record<string, string>) {
  if (!(await readManifest(name))) return print(`gesture: no set ${name}`), false
  if ('stop' in opts) {
    sending.delete(name)
    return print(`  ◂ stopped sending ${name}`), true
  }
  const port = Number(opts.port)
  const address = opts.address ?? `/vm/${name}`
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !OSC_ADDRESS.test(address)) return print('usage: gesture send <name> --port 9000 [--address /vm/<name>] | gesture send <name> --stop'), false
  sending.set(name, { port, address })
  print(`  ◂ while the Move tab tests ${name}: OSC ${address} <gesture> <confidence 0–1> → 127.0.0.1:${port}`)
  return true
}

export async function gestureCommand(args: string[], line: string): Promise<boolean> {
  const [sub, ...rest] = args
  const { pos, opts } = flags(rest)
  const name = pos[0] ?? ''
  if (sub === 'new') return create(name, opts.tracker ?? '', line)
  if (sub === 'train') return trainSet(name, opts.k, line)
  if (sub === 'clear') return clear(name, pos.slice(1).join(' '), line)
  if (sub === 'send') return send(name, opts)
  print('usage: gesture new <name> --tracker hands|body | gesture train <name> [--k 5] | gesture clear <name> <gesture> | gesture send <name> --port 9000 | gesture send <name> --stop')
  return false
}

/** `osc send <port> <address> [values…]`: one message, numbers as floats, to try a connection. */
export function oscCommand(args: string[]): boolean {
  const [sub, portText, address, ...values] = args
  const port = Number(portText)
  if (sub !== 'send' || !Number.isInteger(port) || port < 1024 || port > 65535 || !OSC_ADDRESS.test(address ?? '')) {
    print('usage: osc send <port> <address> [values…]   e.g. osc send 9000 /vm/test hello 1   (to 127.0.0.1 only)')
    return false
  }
  const vals = values.map((v) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : v))
  sendOsc(port, address, vals)
  print(`  ◂ sent ${address} ${vals.join(' ')} → 127.0.0.1:${port}`)
  return true
}
