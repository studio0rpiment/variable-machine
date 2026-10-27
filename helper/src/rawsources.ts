import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKSPACE } from './config.ts'
import { print } from './hub.ts'
import { formatBytes, setRunning, write } from './run.ts'
import { RAW_SOURCES } from './shared/library.ts'
import { parseCsv } from './shared/rowShapes.ts'

/**
 * Raw sources (plan §8): text or tables that aren't training rows yet. Each
 * lands in workspace/raw/<name>/ as source.*, chunks.jsonl (passages of a
 * size a model can read in one go) and a manifest with the license as stated
 * at import. The Data panel's generator can be asked to write rows from a chunk.
 */

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const CHUNK = 1200
/** More than this isn't needed to make a few hundred rows, and fills the disk: only this much is kept. */
const MAX_CHARS = 20 * 1024 * 1024

/**
 * Download text. Past MAX_CHARS it stops and keeps what came, cut at the last
 * whole line: a table's first rows are plenty for a class dataset, and the
 * rest would only fill the disk.
 */
async function fetchText(url: string, abort: AbortController): Promise<string | null> {
  print(`GET ${url}`)
  const res = await fetch(url, { signal: abort.signal, redirect: 'follow' })
  if (!res.ok || !res.body) {
    print(`download failed: ${res.status} ${res.statusText}`)
    return null
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  const decoder = new TextDecoder()
  let text = ''
  let shown = ''
  for await (const chunk of res.body) {
    text += decoder.decode(chunk, { stream: true })
    if (text.length > MAX_CHARS) {
      write('\n')
      const cut = text.slice(0, text.lastIndexOf('\n', MAX_CHARS) + 1)
      print(`kept the first ${formatBytes(cut.length)} (${(cut.split('\n').length - 2).toLocaleString('en-US')} rows of a table): plenty for a class dataset; the rest stays on the portal`)
      return cut
    }
    const line = `downloading ${formatBytes(text.length)}${total ? ` / ${formatBytes(total)}` : ''}`
    if (line !== shown) write(`\r\x1b[2K${(shown = line)}`)
  }
  write('\n')
  return text + decoder.decode()
}

/** Paragraph-aligned passages of about CHUNK characters. */
function chunkText(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 40)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if (cur && cur.length + p.length > CHUNK) {
      out.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur) out.push(cur)
  return out
}

/** CSV → chunks of the header plus a run of rows, as "column: value" lines a model can read. */
function chunkCsv(text: string): string[] {
  const parse = (line: string) => {
    const cells: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
        else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',') cells.push(cur), (cur = '')
      else cur += c
    }
    cells.push(cur)
    return cells
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parse(lines[0] ?? '')
  const rows = lines.slice(1).map(parse)
  const out: string[] = []
  let cur = ''
  for (const r of rows) {
    const rec = header.map((h, i) => `${h}: ${r[i] ?? ''}`).join('; ')
    if (cur && cur.length + rec.length > CHUNK) {
      out.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n${rec}` : rec
  }
  if (cur) out.push(cur)
  return out
}

function tableHead(text: string) {
  const rows = parseCsv(text.slice(0, 200_000))
  return { columns: rows[0] ? Object.keys(rows[0]) : [], sample: rows.slice(0, 3), rows: text.split('\n').filter((l) => l.trim()).length - 1 }
}

async function save(name: string, ext: string, text: string, chunks: string[], meta: { url: string; license: string; licenseChecked: boolean; line: string; kind: string; about?: string; page?: string }) {
  const dir = path.join(WORKSPACE, 'raw', name)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `source.${ext}`), text)
  await fs.writeFile(path.join(dir, 'chunks.jsonl'), chunks.map((t, i) => JSON.stringify({ i, text: t })).join('\n') + '\n')
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify(
      {
        name,
        kind: 'raw',
        created: new Date().toISOString(),
        license: meta.license,
        licenseChecked: meta.licenseChecked,
        inputs: [meta.url],
        command: [meta.line],
        source: meta.kind,
        chunks: chunks.length,
        chars: text.length,
        ...(meta.about && { about: meta.about }),
        ...(meta.page && { page: meta.page }),
        // A table's columns and first rows, so the template step can offer them without reading the whole file.
        ...(ext === 'csv' && tableHead(text)),
      },
      null,
      2,
    ) + '\n',
  )
  print(`  ◂ workspace/raw/${name}: ${chunks.length} passages · ${meta.license}`)
}

/** A CSV field: quoted when it holds a comma, a quote or a line break. */
const cell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/**
 * A table straight from an ArcGIS map service layer (…/MapServer/11 or
 * …/FeatureServer/0), page by page, without its shapes. DC Open Data's own
 * download often answers "being generated, check back later"; the service
 * answers at once. Dates come as milliseconds and are written as days.
 */
async function fetchArcgis(layer: string, abort: AbortController): Promise<string | null> {
  const base = layer.replace(/\/+$/, '').replace(/\/query$/, '')
  print(`GET ${base}`)
  const info = (await (await fetch(`${base}?f=json`, { signal: abort.signal })).json()) as { name?: string; fields?: { name: string; type: string }[]; maxRecordCount?: number; error?: { message?: string }; dateFieldsTimeReference?: { timeZoneIANA?: string } }
  if (!info.fields?.length) {
    print(`not a table: ${info.error?.message ?? 'the address has no fields; give a layer, like …/MapServer/11'}`)
    return null
  }
  const fields = info.fields.filter((f) => !/geometry|blob|raster/i.test(f.type))
  const dates = new Set(fields.filter((f) => /date/i.test(f.type)).map((f) => f.name))
  // A date with a time keeps its time, in the layer's own time zone (DC's are America/New_York), so hours can be asked about.
  const zone = info.dateFieldsTimeReference?.timeZoneIANA ?? 'UTC'
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const asDate = (ms: number) => {
    const p = Object.fromEntries(local.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
    const time = `${p.hour}:${p.minute}`
    return time === '00:00' ? `${p.year}-${p.month}-${p.day}` : `${p.year}-${p.month}-${p.day} ${time}`
  }
  const page = Math.min(info.maxRecordCount ?? 1000, 2000)
  const lines = [fields.map((f) => cell(f.name)).join(',')]
  let size = lines[0].length
  for (let offset = 0; ; offset += page) {
    const q = `${base}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json&resultOffset=${offset}&resultRecordCount=${page}`
    const d = (await (await fetch(q, { signal: abort.signal })).json()) as { features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message?: string } }
    if (d.error) throw new Error(d.error.message ?? 'the service answered with an error')
    for (const { attributes: a } of d.features ?? []) {
      const row = fields.map((f) => {
        const v = a[f.name]
        return cell(dates.has(f.name) && typeof v === 'number' ? asDate(v) : v)
      }).join(',')
      lines.push(row)
      size += row.length + 1
    }
    write(`\r\x1b[2Kread ${(lines.length - 1).toLocaleString('en-US')} rows`)
    if (!d.features?.length || !d.exceededTransferLimit) break
    if (size > MAX_CHARS) {
      write('\n')
      print(`kept the first ${(lines.length - 1).toLocaleString('en-US')} rows: plenty for a class dataset; the rest stays on the portal`)
      break
    }
  }
  write('\n')
  if (info.name) print(`table: ${info.name} · ${fields.length} columns`)
  return lines.join('\n') + '\n'
}

/**
 * Something that isn't a table where a table was expected: a portal's
 * "still preparing" note, an error page, a login page. Says what it was.
 */
function notATable(text: string): string | null {
  const t = text.trimStart()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { status?: string; message?: string }
      if (/pending|processing/i.test(j.status ?? '') || /being generated|check back/i.test(j.message ?? ''))
        return `the portal is still preparing this download ("${j.message ?? j.status}"). For DC Open Data, search again and bring the table in: it now reads the table directly. Or try again in a few minutes.`
      return `the address sent back JSON, not a table${j.message ? `: ${j.message}` : ''}`
    } catch {
      return 'the address sent back something that is not a table'
    }
  }
  if (t.startsWith('<')) return 'the address sent back a web page, not a table: it may need a login, or be the dataset\'s page rather than its download'
  return null
}

/**
 * JSON lines → CSV, so a .jsonl table becomes a table like any other: the
 * columns are the first object's keys, values that aren't text are written as
 * JSON, and every cell is quoted.
 */
function jsonlToCsv(text: string): string | null {
  const rows: Record<string, unknown>[] = []
  for (const l of text.split('\n')) {
    if (!l.trim()) continue
    try {
      const o = JSON.parse(l) as unknown
      if (o && typeof o === 'object' && !Array.isArray(o)) rows.push(o as Record<string, unknown>)
    } catch {
      // not a JSON line: skipped
    }
  }
  if (!rows.length) return null
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => `"${(typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)).replace(/"/g, '""')}"`
  print(`${rows.length.toLocaleString('en-US')} JSON lines · columns ${cols.join(', ')}`)
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

export async function rawCommand(args: string[], opts: Record<string, string>, line: string): Promise<boolean> {
  const [kind, what, name] = args
  if (!kind || !(kind in RAW_SOURCES) || !what || !name || !NAME.test(name)) {
    print('usage: data raw gutenberg <book number> <name>\n       data raw csv <url> <name> --license "<what the source states>" [--about "<what it is>"] [--page <its page>]\n       data raw arcgis <layer url> <name> --license "<…>" [--about "<…>"] [--page <…>]\n       data raw jsonl <url> <name> --license "<…>"   (a table written as JSON lines)\n       data raw txt <url> <name> --license "<what the source states>"')
    return false
  }
  try {
    await fs.access(path.join(WORKSPACE, 'raw', name))
    print(`workspace/raw/${name} already exists`)
    return false
  } catch {
    // free
  }
  const abort = new AbortController()
  setRunning({ abort })
  try {
    if (kind === 'gutenberg') {
      if (!/^\d+$/.test(what)) return print('data raw gutenberg: give the book number from gutenberg.org'), false
      const url = `https://www.gutenberg.org/cache/epub/${what}/pg${what}.txt`
      const text = await fetchText(url, abort)
      if (!text) return false
      // Keep the book, not Project Gutenberg's header and footer.
      const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i)
      const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i)
      const body = text.slice(start >= 0 ? text.indexOf('\n', start) + 1 : 0, end > 0 ? end : undefined)
      const title = /Title:\s*(.+)/.exec(text)?.[1]?.trim()
      if (title) print(`title: ${title}`)
      await save(name, 'txt', body, chunkText(body), { url, license: RAW_SOURCES.gutenberg.license, licenseChecked: true, line, kind })
      return true
    }
    if (!/^https?:\/\//.test(what)) return print(`data raw ${kind}: give a http(s) URL`), false
    if (!opts.license?.trim()) {
      print(`data raw ${kind}: say what license the source states, e.g. --license "CC BY 4.0". It goes in the manifest so everything made from it carries it.`)
      return false
    }
    const fetched = kind === 'arcgis' ? await fetchArcgis(what, abort) : await fetchText(what, abort)
    if (!fetched) return false
    const text = kind === 'jsonl' ? jsonlToCsv(fetched) : fetched
    if (!text) return print('data raw jsonl: nothing saved. No line was a JSON object'), false
    const table = kind === 'csv' || kind === 'arcgis' || kind === 'jsonl'
    const wrong = table ? notATable(text) : null
    if (wrong) {
      print(`data raw: nothing saved. ${wrong}`)
      return false
    }
    if (table && parseCsv(text.slice(0, 200_000)).length === 0) {
      print('data raw: nothing saved. The table has no rows under its header line')
      return false
    }
    const chunks = table ? chunkCsv(text) : chunkText(text)
    await save(name, table ? 'csv' : kind, text, chunks, { url: what, license: `${opts.license.trim()} (as stated at import)`, licenseChecked: false, line, kind, about: opts.about?.trim(), page: opts.page?.trim() })
    if (table) print(`  next: read it and make a training set from it ("ask a table" on the Data tab, or data profile raw/${name}), or write one question and its answer by hand (data template raw/${name} …)`)
    return true
  } catch (err) {
    print(abort.signal.aborted ? '  ◂ stopped' : `data raw: ${(err as Error).message}`)
    return false
  } finally {
    setRunning(null)
  }
}
