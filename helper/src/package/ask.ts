/**
 * ask.js in a package: the source. `package <model>` bundles this with the
 * runner (shared/tableQuery.ts) into one plain JavaScript file that works in
 * a web page (<script src="ask.js">), in Node (require('./ask.js')), and from
 * the command line (node ask.js "<question>", or node ask.js --osc 9001 for
 * TouchDesigner and Max). Ollama, on this computer, writes the query; the
 * runner answers it from the table.
 */
import { parseQuery, phrase, prepare, runQuery, toSql, type Query, type Result, type Roles, type Table } from '../shared/tableQuery.ts'

declare const require: (m: string) => any
declare const process: { argv: string[]; exit: (n: number) => void; stdout: { write: (s: string) => void } }

export interface Config {
  /** the model's name in Ollama, as `ollama create` made it */
  model: string
  /** the line the model was trained with; it writes queries only after it */
  system: string
  /** where Ollama answers: http://127.0.0.1:11434 */
  ollama?: string
}

export interface Answer {
  question: string
  /** the answer in a sentence, or why there is none */
  answer: string
  /** the query the model wrote, when it was one */
  query: Query | null
  /** the first rows behind the answer */
  rows: Record<string, string>[]
  /** the numbers: value, matched, and the sides or groups */
  result: Result | null
  sql: string | null
  /** what the model wrote, as it wrote it */
  wrote: string
  /** set when what it wrote isn't a query the table can run */
  problem: string | null
}

/** An ask function for one table: question → Ollama → query → runner → answer. */
export function create(table: Table, roles: Roles, config: Config) {
  const p = prepare(table, roles)
  const ollama = (config.ollama ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  return async function ask(question: string): Promise<Answer> {
    const res = await fetch(`${ollama}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: config.system }, { role: 'user', content: question }], stream: false, format: 'json', options: { temperature: 0, num_predict: 200 } }),
    })
    const body = (await res.json()) as { message?: { content?: string }; error?: string }
    if (body.error) throw new Error(`Ollama: ${body.error}`)
    const wrote = body.message?.content ?? ''
    const parsed = parseQuery(wrote)
    if ('error' in parsed) return { question, answer: `No answer: the model's query can't be read (${parsed.error}).`, query: null, rows: [], result: null, sql: null, wrote, problem: parsed.error }
    const result = runQuery(p, parsed.query, 20)
    if (!result.ok) return { question, answer: `No answer: the table can't run that query (${result.error}).`, query: parsed.query, rows: [], result, sql: null, wrote, problem: result.error }
    return { question, answer: phrase(result, parsed.query, roles), query: parsed.query, rows: result.rows, result, sql: toSql(parsed.query, roles), wrote, problem: null }
  }
}

/** In a web page: data/table.js sets ASK_DATA, then this makes the ask function. */
export function fromPage(ollama?: string) {
  const d = (globalThis as unknown as { ASK_DATA?: { table: Table; roles: Roles; config: Config } }).ASK_DATA
  if (!d) throw new Error('load data/table.js before ask.js')
  return create(d.table, d.roles, { ...d.config, ...(ollama && { ollama }) })
}

/** In Node: read the package's folder (data/table.json, roles.json, ask.json). */
export function load(dir: string, ollama?: string) {
  const fs = require('fs')
  const path = require('path')
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const config = read('ask.json') as Config
  return create(read('data/table.json') as Table, read('roles.json') as Roles, { ...config, ...(ollama && { ollama }) })
}

/* ---------- OSC, for TouchDesigner, Max, Pure Data ---------- */

function oscEncode(address: string, args: (string | number)[]) {
  const B = require('buffer').Buffer
  const pad = (b: any) => B.concat([b, B.alloc(4 - (b.length % 4))])
  const str = (s: string) => pad(B.from(s, 'utf8'))
  const tags = ',' + args.map((a) => (typeof a === 'number' ? 'f' : 's')).join('')
  return B.concat([str(address), str(tags), ...args.map((a) => (typeof a === 'string' ? str(a) : (() => { const b = B.alloc(4); b.writeFloatBE(a); return b })()))])
}

function oscDecode(buf: any): { address: string; args: (string | number)[] } | null {
  let i = 0
  const str = () => {
    const end = buf.indexOf(0, i)
    if (end < 0) return null
    const s = buf.toString('utf8', i, end)
    // strings end with a 0 and are padded to a multiple of four bytes
    i = Math.ceil((end + 1) / 4) * 4
    return s
  }
  const address = str()
  const tags = str()
  if (!address || !tags?.startsWith(',')) return null
  const args: (string | number)[] = []
  for (const t of tags.slice(1)) {
    if (t === 's') args.push(str() ?? '')
    else if (t === 'f') (args.push(buf.readFloatBE(i)), (i += 4))
    else if (t === 'i') (args.push(buf.readInt32BE(i)), (i += 4))
    else return { address, args }
  }
  return { address, args }
}

/**
 * node ask.js --osc 9001 [--reply 9000]: listen for /ask "<question>" on
 * 127.0.0.1:9001, and send back /answer "<sentence>", /value <number>,
 * /query "<json>" to port 9000 (or to whoever asked, with --reply 0).
 */
function serveOsc(ask: (q: string) => Promise<Answer>, port: number, reply: number) {
  const dgram = require('dgram')
  const sock = dgram.createSocket('udp4')
  sock.on('message', async (msg: any, from: { port: number }) => {
    const m = oscDecode(msg)
    if (!m || m.address !== '/ask' || typeof m.args[0] !== 'string') return
    const to = reply || from.port
    try {
      const a = await ask(m.args.join(' '))
      const send = (address: string, args: (string | number)[]) => sock.send(oscEncode(address, args), to, '127.0.0.1')
      send('/answer', [a.answer])
      if (a.result?.ok) send('/value', [a.result.value])
      for (const s of (a.result?.ok && (a.result.sides ?? a.result.groups)) || []) send('/part', [s.label, s.value])
      send('/query', [a.query ? JSON.stringify(a.query) : a.wrote])
      process.stdout.write(`${m.args[0]} → ${a.answer}\n`)
    } catch (err) {
      sock.send(oscEncode('/error', [(err as Error).message]), to, '127.0.0.1')
    }
  })
  sock.bind(port, '127.0.0.1', () => process.stdout.write(`listening for /ask "<question>" on 127.0.0.1:${port}; answers go to ${reply ? `port ${reply}` : 'whoever asked'}\n`))
}

/** node ask.js "<question>" prints the answer as JSON; --osc serves TouchDesigner and Max. */
export async function cli(argv: string[], dir: string) {
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv.splice(i, 2)[1] : undefined
  }
  const osc = flag('osc')
  const reply = Number(flag('reply') ?? 9000)
  const ollama = flag('ollama')
  const ask = load(dir, ollama)
  if (osc) return serveOsc(ask, Number(osc), reply)
  const q = argv.join(' ').trim()
  if (!q) {
    process.stdout.write('usage: node ask.js "<question>"          the answer, as JSON\n       node ask.js --osc 9001 [--reply 9000]   OSC: /ask "<question>" in, /answer /value /part /query out\n')
    return process.exit(1)
  }
  const a = await ask(q)
  process.stdout.write(JSON.stringify({ question: a.question, answer: a.answer, query: a.query, value: a.result?.ok ? a.result.value : null, parts: a.result?.ok ? (a.result.sides ?? a.result.groups ?? null) : null, rows: a.rows.slice(0, 3), problem: a.problem }, null, 2) + '\n')
}
