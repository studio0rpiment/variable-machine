/**
 * Asking a table: a small query format, written as JSON, and the runner that
 * answers it from the table's own rows. A trained model's job is only to turn
 * a question into a query; the answer is computed here, so it is always what
 * the table says.
 *
 * This file imports nothing. The helper uses it, the page uses it, and an
 * exported package carries a JavaScript copy of it (ask.js reads it).
 *
 *   {"where":{"OFFENSE":"HOMICIDE","WARD":"6"},"when":{"month":"2025-03"}}
 *     how many rows have OFFENSE HOMICIDE and WARD 6, in March 2025
 *   {"where":{"OFFENSE":"ROBBERY"},"near":{"BLOCK":"1200 U STREET NW","blocks":2}}
 *     robberies within two blocks of the 1200 block of U Street NW
 *   {"where":{"OFFENSE":"BURGLARY"},"by":"WARD"}
 *     burglaries in each ward, most first
 *   {"where":{"OFFENSE":"ROBBERY"},"compare":[{"where":{"WARD":"1"}},{"where":{"WARD":"2"}}]}
 *     the same count twice, once for each side
 *
 * Keys, all optional, in this order:
 *   where    column → a value, or a list of values (any of them). Exact, but
 *            case doesn't matter, and the table's own words for a value work
 *            (roles.json: "murder" finds HOMICIDE).
 *   near     {"<place column>": "<number> <street>", "blocks": n} for blocks
 *            of a street (± n blocks, 0 = that block), or "m": metres when the
 *            table has latitude and longitude.
 *   when     year: 2025 · month: "2025-03" · from/to: "2025-03-01" · weekday:
 *            "saturday" or a list · hours: [22, 6] (from 22:00 to 06:00) ·
 *            last: "month" | "week" | "year" | "30 days" (before the table's
 *            newest date) · column: which date column, when there are several.
 *   by       a column: the count (or sum, or average) for each of its values.
 *   top      how many of those to keep (5).
 *   sum/avg  a number column: add it up, or average it, instead of counting.
 *   compare  two (or more) queries, each laid over this one: the same
 *            question asked of each side.
 */

export type Role = 'what' | 'where' | 'when' | 'how much' | 'how' | 'id' | 'other'
export type ColumnType = 'text' | 'number' | 'date' | 'place'

export interface ColumnRole {
  name: string
  role: Role
  type: ColumnType
  /** what the column is called in a sentence: "ward", "offense" */
  label: string
  /** for a where column: a block of a street, a latitude, a longitude, or an area (ward, neighbourhood) */
  place?: 'block' | 'lat' | 'lon' | 'area' | 'address'
}

export interface Roles {
  /** workspace/raw/<table> */
  table: string
  /** what one row is: "incident", "tree" */
  noun: string
  /** other words a question uses for all the rows, plural: "crimes", "offenses" */
  nouns?: string[]
  columns: ColumnRole[]
  /** column → value → the words people use for it ("HOMICIDE": ["homicide", "murder", "killing"]) */
  words: Record<string, Record<string, string[]>>
  title?: string
  license?: string
  source?: string
  page?: string
}

export interface Table {
  columns: string[]
  rows: string[][]
}

export interface Query {
  where?: Record<string, string | string[]>
  near?: Record<string, string | number>
  when?: When
  by?: string
  top?: number
  sum?: string
  avg?: string
  compare?: Query[]
}

export interface When {
  column?: string
  year?: number
  month?: string
  from?: string
  to?: string
  weekday?: string | string[]
  hours?: [number, number]
  last?: string
}

export interface Side {
  label: string
  value: number
  matched: number
}

export type Result =
  | {
      ok: true
      kind: 'number' | 'groups' | 'compare'
      measure: 'count' | 'sum' | 'avg'
      column?: string
      /** the number (count, sum or average) for the whole query */
      value: number
      matched: number
      groups?: Side[]
      sides?: Side[]
      /** the first rows behind it, as column → value */
      rows: Record<string, string>[]
      /** the dates the table covers, so an answer can say how current it is */
      range: { from: string; to: string; column: string } | null
      /** what the runner did that a reader should know: words it matched to a value, a period it filled in */
      notes: string[]
    }
  | { ok: false; error: string }

const QUERY_KEYS = ['where', 'near', 'when', 'by', 'top', 'sum', 'avg', 'compare']
const WHEN_KEYS = ['column', 'year', 'month', 'from', 'to', 'weekday', 'hours', 'last']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/* ---------- reading values ---------- */

/** A date or date and time as written in a table → a moment, read as written (no time zone). */
export function readDate(v: string): { t: number; hour: number | null } | null {
  const s = v.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
    return Number.isFinite(t) ? { t, hour: m[4] ? +m[4] : null } : null
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?$/i.exec(s)
  if (m) {
    let h = m[4] ? +m[4] : 0
    if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0)
    return { t: Date.UTC(+m[3], +m[1] - 1, +m[2], h, m[5] ? +m[5] : 0), hour: m[4] ? h : null }
  }
  return null
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

/** "1200 - 1299 BLOCK OF U STREET NW", "1200 block of U St NW", "1200 U STREET NW" → 1200 and U STREET NW. */
export function readBlock(v: string): { n: number; street: string } | null {
  const m = /^\s*(\d+)\s*(?:-\s*\d+\s*)?(?:block\s+of\s+|blk\s+)?(.+)$/i.exec(v)
  if (!m) return null
  const street = normalStreet(m[2])
  // a street has a name: 397162.06 is a coordinate, not the 397100 block of ".06"
  return /[A-Z]{2}|^[A-Z]\b/.test(street) ? { n: Math.floor(Number(m[1]) / 100) * 100, street } : null
}

const STREET_WORDS: Record<string, string> = { ST: 'STREET', AVE: 'AVENUE', AV: 'AVENUE', RD: 'ROAD', PL: 'PLACE', BLVD: 'BOULEVARD', DR: 'DRIVE', CT: 'COURT', TER: 'TERRACE', LN: 'LANE', PKWY: 'PARKWAY', CIR: 'CIRCLE', SQ: 'SQUARE', HWY: 'HIGHWAY' }

export function normalStreet(s: string) {
  return s
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/^THE\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(' ')
}

/** Distance in metres between two points on the earth. */
function metres(a: [number, number], b: [number, number]) {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b[0] - a[0])
  const dLon = r(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/* ---------- the runner ---------- */

/** What the runner keeps about a table between questions: column positions, and dates read once. */
export interface Prepared {
  table: Table
  roles: Roles
  index: Map<string, number>
  dates: Map<string, ({ t: number; hour: number | null } | null)[]>
  /** column → its values, upper-cased → as written */
  values: Map<string, Map<string, string>>
}

export function prepare(table: Table, roles: Roles): Prepared {
  const index = new Map(table.columns.map((c, i) => [c, i]))
  const dates = new Map<string, ({ t: number; hour: number | null } | null)[]>()
  const values = new Map<string, Map<string, string>>()
  for (const c of roles.columns) {
    const i = index.get(c.name)
    if (i === undefined) continue
    if (c.type === 'date') dates.set(c.name, table.rows.map((r) => readDate(r[i] ?? '')))
    else if (c.type !== 'number') {
      const seen = new Map<string, string>()
      for (const r of table.rows) {
        const v = (r[i] ?? '').trim()
        if (v && !seen.has(v.toUpperCase())) seen.set(v.toUpperCase(), v)
        if (seen.size > 5000) break
      }
      values.set(c.name, seen)
    }
  }
  return { table, roles, index, dates, values }
}

/** The main date column: the first one with the when role. */
const mainDate = (p: Prepared) => p.roles.columns.find((c) => c.role === 'when' && c.type === 'date')?.name

export function dateRange(p: Prepared, column = mainDate(p)): { from: string; to: string; column: string } | null {
  if (!column) return null
  let lo = Infinity
  let hi = -Infinity
  for (const d of p.dates.get(column) ?? []) {
    if (!d) continue
    if (d.t < lo) lo = d.t
    if (d.t > hi) hi = d.t
  }
  return Number.isFinite(lo) ? { from: day(lo), to: day(hi), column } : null
}

/** Find a value as the table writes it: as given, any case, or through the words people use for it. */
export function findValue(p: Prepared, column: string, given: string): string | null {
  const vals = p.values.get(column)
  const g = given.trim().toUpperCase()
  if (!vals) return given.trim()
  if (vals.has(g)) return vals.get(g)!
  const words = p.roles.words[column] ?? {}
  for (const [value, ws] of Object.entries(words)) if (ws.some((w) => w.replace('…', '').trim().toUpperCase() === g)) return value
  // "ward 6" for 6, "Cluster 25" written "cluster 25"
  const label = p.roles.columns.find((c) => c.name === column)?.label.toUpperCase()
  if (label && g.startsWith(label + ' ') && vals.has(g.slice(label.length + 1))) return vals.get(g.slice(label.length + 1))!
  return null
}

const closest = (p: Prepared, column: string, given: string) => {
  const vals = [...(p.values.get(column)?.values() ?? [])]
  const g = given.toUpperCase()
  const near = vals.filter((v) => v.toUpperCase().includes(g) || g.includes(v.toUpperCase())).slice(0, 4)
  return (near.length ? near : vals.slice(0, 8)).join(', ') + (vals.length > 8 && !near.length ? ', …' : '')
}

type Filter = (i: number) => boolean

function asList(v: unknown): string[] | null {
  if (typeof v === 'string' || typeof v === 'number') return [String(v)]
  if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.map(String)
  return null
}

/** Check a query against the table and turn it into one test per row. Throws a plain sentence when it can't. */
function compile(p: Prepared, q: Query, notes: string[]): Filter[] {
  const tests: Filter[] = []
  const col = (name: string, what: string) => {
    if (!p.index.has(name)) throw new Error(`${what}: there is no column ${name}. Columns: ${p.table.columns.join(', ')}`)
    return p.index.get(name)!
  }
  for (const [name, given] of Object.entries(q.where ?? {})) {
    const i = col(name, 'where')
    const list = asList(given)
    if (!list) throw new Error(`where: ${name} needs a value or a list of values`)
    const want = new Set<string>()
    for (const g of list) {
      const v = findValue(p, name, g)
      if (v === null) throw new Error(`${name} has no value "${g}". It has: ${closest(p, name, g)}`)
      if (v.toUpperCase() !== g.trim().toUpperCase()) notes.push(`"${g}" read as ${name} ${v}`)
      want.add(v.toUpperCase())
    }
    tests.push((r) => want.has((p.table.rows[r][i] ?? '').trim().toUpperCase()))
  }
  if (q.near) {
    const entries = Object.entries(q.near).filter(([k]) => k !== 'blocks' && k !== 'm')
    if (entries.length !== 1 || typeof entries[0][1] !== 'string') throw new Error('near: name one place column and a place, like {"BLOCK": "1200 U STREET NW", "blocks": 1}')
    const [name, place] = entries[0] as [string, string]
    const i = col(name, 'near')
    const at = readBlock(place)
    if (!at) throw new Error(`near: "${place}" isn't a block of a street; write it as a number and a street, like 1200 U STREET NW`)
    const blocks = q.near.blocks === undefined ? 0 : Number(q.near.blocks)
    const m = q.near.m === undefined ? null : Number(q.near.m)
    const read = p.table.rows.map((r) => readBlock(r[i] ?? ''))
    const here = (r: number) => read[r]?.street === at.street && read[r]!.n === at.n
    if (m !== null) {
      if (!(m > 0 && m <= 20000)) throw new Error('near: m is metres, more than 0 and at most 20000')
      const lat = p.roles.columns.find((c) => c.place === 'lat')
      const lon = p.roles.columns.find((c) => c.place === 'lon')
      if (!lat || !lon) throw new Error('near: this table has no latitude and longitude columns, so near takes blocks, not m')
      const li = col(lat.name, 'near')
      const lo = col(lon.name, 'near')
      const pts: [number, number][] = []
      for (let r = 0; r < p.table.rows.length; r++) if (here(r)) pts.push([Number(p.table.rows[r][li]), Number(p.table.rows[r][lo])])
      const ok = pts.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a !== 0)
      if (!ok.length) throw new Error(`near: no row is on the ${at.n} block of ${at.street}, so there is nowhere to measure from`)
      const c: [number, number] = [ok.reduce((s, x) => s + x[0], 0) / ok.length, ok.reduce((s, x) => s + x[1], 0) / ok.length]
      tests.push((r) => {
        const a = Number(p.table.rows[r][li])
        const b = Number(p.table.rows[r][lo])
        return Number.isFinite(a) && Number.isFinite(b) && metres(c, [a, b]) <= m
      })
    } else {
      if (!(blocks >= 0 && blocks <= 50 && Number.isInteger(blocks))) throw new Error('near: blocks is a whole number from 0 (that block) to 50')
      if (!read.some((b) => b?.street === at.street)) throw new Error(`near: no row is on ${at.street}`)
      tests.push((r) => read[r]?.street === at.street && Math.abs(read[r]!.n - at.n) <= blocks * 100)
    }
  }
  if (q.when) {
    const w = q.when
    const bad = Object.keys(w).find((k) => !WHEN_KEYS.includes(k))
    if (bad) throw new Error(`when: no key ${bad}. It takes ${WHEN_KEYS.join(', ')}`)
    const name = w.column ?? mainDate(p)
    if (!name || !p.dates.has(name)) throw new Error(`when: ${name ? `${name} is not a date column` : 'this table has no date column'}`)
    const ds = p.dates.get(name)!
    let lo = -Infinity
    let hi = Infinity
    if (w.year !== undefined) {
      const y = Number(w.year)
      if (!Number.isInteger(y)) throw new Error('when: year is a number, like 2025')
      lo = Math.max(lo, Date.UTC(y, 0, 1))
      hi = Math.min(hi, Date.UTC(y + 1, 0, 1))
    }
    if (w.month !== undefined) {
      const m = /^(\d{4})-(\d{2})$/.exec(String(w.month))
      if (!m) throw new Error('when: month is written "2025-03"')
      lo = Math.max(lo, Date.UTC(+m[1], +m[2] - 1, 1))
      hi = Math.min(hi, Date.UTC(+m[1], +m[2], 1))
    }
    if (w.from !== undefined || w.to !== undefined) {
      const f = w.from !== undefined ? readDate(String(w.from)) : null
      const t = w.to !== undefined ? readDate(String(w.to)) : null
      if ((w.from !== undefined && !f) || (w.to !== undefined && !t)) throw new Error('when: from and to are dates, written "2025-03-01"')
      if (f) lo = Math.max(lo, f.t)
      // "to" a day means to the end of that day
      if (t) hi = Math.min(hi, t.t + (t.hour === null ? 86400000 : 60000))
    }
    if (w.last !== undefined) {
      const m = /^(?:(\d+)\s*)?(day|week|month|year)s?$/.exec(String(w.last).trim().toLowerCase())
      if (!m) throw new Error('when: last is "month", "week", "year" or a number of days, like "30 days"')
      const range = dateRange(p, name)
      if (!range) throw new Error(`when: ${name} has no dates`)
      const end = readDate(range.to)!.t + 86400000
      const n = Number(m[1] ?? 1)
      const span = { day: 1, week: 7, month: 30, year: 365 }[m[2] as 'day']
      lo = Math.max(lo, end - n * span * 86400000)
      hi = Math.min(hi, end)
      notes.push(`"the last ${m[1] ? `${n} ` : ''}${m[2]}${n > 1 ? 's' : ''}" counted back from the table's newest date, ${range.to}`)
    }
    let days: Set<number> | null = null
    if (w.weekday !== undefined) {
      const list = asList(w.weekday)
      const idx = list?.map((d) => WEEKDAYS.findIndex((x) => x.startsWith(d.trim().toLowerCase().slice(0, 3))))
      if (!idx || idx.some((d) => d < 0)) throw new Error('when: weekday is a day\'s name, like "saturday", or a list of them')
      days = new Set(idx)
    }
    let hours: [number, number] | null = null
    if (w.hours !== undefined) {
      const h = w.hours
      if (!Array.isArray(h) || h.length !== 2 || h.some((x) => !Number.isInteger(x) || x < 0 || x > 24)) throw new Error('when: hours is [from, to] in whole hours, like [22, 6]')
      if (!ds.some((d) => d?.hour !== null && d?.hour !== undefined)) throw new Error(`when: ${name} has dates without times, so hours can't be told apart`)
      hours = [h[0], h[1]]
    }
    // a period the table doesn't cover: say so, rather than let "none" read as an answer
    const range = dateRange(p, name)
    if (range && (lo >= readDate(range.to)!.t + 86400000 || hi <= readDate(range.from)!.t)) notes.push(`outside the table: it covers ${prettyDate(range.from)} to ${prettyDate(range.to)}, so it can't say what happened ${describeWhen(w)}`)
    tests.push((r) => {
      const d = ds[r]
      if (!d) return false
      if (d.t < lo || d.t >= hi) return false
      if (days && !days.has(new Date(d.t).getUTCDay())) return false
      if (hours) {
        if (d.hour === null) return false
        const [a, b] = hours
        if (a <= b ? d.hour < a || d.hour >= b : d.hour < a && d.hour >= b) return false
      }
      return true
    })
  }
  return tests
}

function measureOf(p: Prepared, q: Query): { measure: 'count' | 'sum' | 'avg'; column?: string; index?: number } {
  if (q.sum && q.avg) throw new Error('sum and avg: one or the other')
  const column = q.sum ?? q.avg
  if (!column) return { measure: 'count' }
  if (!p.index.has(column)) throw new Error(`${q.sum ? 'sum' : 'avg'}: there is no column ${column}`)
  return { measure: q.sum ? 'sum' : 'avg', column, index: p.index.get(column) }
}

function measure(p: Prepared, rows: number[], m: ReturnType<typeof measureOf>) {
  if (m.measure === 'count') return rows.length
  let total = 0
  let n = 0
  for (const r of rows) {
    const v = Number(p.table.rows[r][m.index!])
    if (p.table.rows[r][m.index!]?.trim() && Number.isFinite(v)) (total += v), n++
  }
  return m.measure === 'sum' ? total : n ? total / n : 0
}

const asObject = (p: Prepared, r: number) => Object.fromEntries(p.table.columns.map((c, i) => [c, p.table.rows[r][i] ?? '']))

/** A query laid over another: where and near add up, when is merged, the rest is replaced. */
function over(base: Query, side: Query): Query {
  const { compare: _c, ...b } = base
  return {
    ...b,
    ...side,
    where: { ...b.where, ...side.where },
    ...((b.near || side.near) && { near: side.near ?? b.near }),
    ...((b.when || side.when) && { when: { ...b.when, ...side.when } }),
  }
}

/** Read a query from what a model wrote: JSON, maybe inside other words or a code fence. */
export function parseQuery(text: string): { query: Query } | { error: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return { error: 'no query in it: the model wrote no { … }' }
  let v: unknown
  try {
    v = JSON.parse(text.slice(start, end + 1))
  } catch {
    return { error: 'the query isn\'t valid JSON' }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'the query isn\'t a JSON object' }
  const bad = checkKeys(v as Record<string, unknown>)
  return bad ? { error: bad } : { query: v as Query }
}

function checkKeys(q: Record<string, unknown>): string | null {
  const bad = Object.keys(q).find((k) => !QUERY_KEYS.includes(k))
  if (bad) return `the query has a key "${bad}" the runner doesn't know. It knows ${QUERY_KEYS.join(', ')}`
  for (const k of ['where', 'near', 'when'] as const) if (q[k] !== undefined && (typeof q[k] !== 'object' || Array.isArray(q[k]) || q[k] === null)) return `${k} is an object, {…}`
  if (q.by !== undefined && typeof q.by !== 'string') return 'by is a column name'
  if (q.compare !== undefined) {
    if (!Array.isArray(q.compare) || q.compare.length < 2) return 'compare is a list of two or more queries'
    for (const s of q.compare) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return 'each side of compare is a query, {…}'
      if ((s as Query).compare) return 'a side of compare has its own compare'
      const e = checkKeys(s as Record<string, unknown>)
      if (e) return e
    }
  }
  return null
}

/** Run a query. Every answer comes from the rows; a query the table can't answer says why instead. */
export function runQuery(p: Prepared, q: Query, keep = 20): Result {
  const notes: string[] = []
  try {
    const bad = checkKeys(q as Record<string, unknown>)
    if (bad) throw new Error(bad)
    const m = measureOf(p, q)
    const select = (qq: Query) => {
      const tests = compile(p, qq, notes)
      const out: number[] = []
      for (let r = 0; r < p.table.rows.length; r++) if (tests.every((t) => t(r))) out.push(r)
      return out
    }
    const range = dateRange(p, q.when?.column)
    if (q.compare) {
      const sides = q.compare.map((s) => {
        const rows = select(over(q, s))
        return { label: sideLabel(s, p.roles), value: measure(p, rows, m), matched: rows.length, rows }
      })
      const all = [...new Set(sides.flatMap((s) => s.rows))]
      return { ok: true, kind: 'compare', ...m, value: measure(p, all, m), matched: all.length, sides: sides.map(({ rows: _r, ...s }) => s), rows: sides.flatMap((s) => s.rows.slice(0, Math.ceil(keep / sides.length))).map((r) => asObject(p, r)), range, notes }
    }
    const rows = select(q)
    if (q.by) {
      if (!p.index.has(q.by)) throw new Error(`by: there is no column ${q.by}`)
      const i = p.index.get(q.by)!
      const groups = new Map<string, number[]>()
      for (const r of rows) {
        const k = (p.table.rows[r][i] ?? '').trim() || '(blank)'
        groups.set(k, [...(groups.get(k) ?? []), r])
      }
      const top = Math.max(1, Math.min(50, Number(q.top ?? 5)))
      const list = [...groups].map(([label, rs]) => ({ label, value: measure(p, rs, m), matched: rs.length })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      return { ok: true, kind: 'groups', ...m, value: measure(p, rows, m), matched: rows.length, groups: list.slice(0, top), rows: rows.slice(0, keep).map((r) => asObject(p, r)), range, notes }
    }
    return { ok: true, kind: 'number', ...m, value: measure(p, rows, m), matched: rows.length, rows: rows.slice(0, keep).map((r) => asObject(p, r)), range, notes }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/* ---------- saying it ---------- */

const MONTH_RE = /^(\d{4})-(\d{2})$/
type Words = Pick<Roles, 'noun' | 'columns' | 'words'>

/** A coded label, tidied for a sentence: THEFT F/AUTO → theft from auto, ASSAULT W/DANGEROUS WEAPON → assault with dangerous weapon. */
export function tidy(v: string): string {
  const t = v
    .replace(/\bW\//gi, 'with ')
    .replace(/\bF\//gi, 'from ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*\/\s*/g, ' or ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t === t.toUpperCase() && /[A-Z]{3}/.test(t) ? t.toLowerCase() : t
}

export function pluralOf(word: string): string {
  const w = word.trim()
  const last = w.split(' ').pop() ?? w
  const head = w.slice(0, w.length - last.length)
  const p = /(s|x|z|ch|sh)$/i.test(last) ? last + 'es' : /[^aeiou]y$/i.test(last) ? last.slice(0, -1) + 'ies' : last + 's'
  return head + p
}

/** How a value of an area column is said: "ward 6", "Cluster 25" (not "neighborhood cluster Cluster 25"), "ANC 6E". */
export function areaWords(label: string, v: string): string {
  const first = v.trim().split(/\s+/)[0].toLowerCase()
  return /[a-z]/i.test(first) && label.toLowerCase().split(' ').includes(first) ? v : `${label} ${v}`
}

/** "1200 - 1299 BLOCK OF U STREET NW" → said "1200 block of U Street NW", queried "1200 U STREET NW". */
export function blockWords(v: string): { said: string; query: string } | null {
  const b = readBlock(v)
  if (!b) return null
  const street = b.street
    .split(' ')
    .map((w) => (/^(NW|NE|SW|SE|N|S|E|W)$/.test(w) ? w : /^\d/.test(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ')
  return { said: `${b.n} block of ${street}`, query: `${b.n} ${b.street}` }
}

export function describeWhen(w: When): string {
  const parts: string[] = []
  if (w.month && MONTH_RE.test(w.month)) {
    const [, y, m] = MONTH_RE.exec(w.month)!
    parts.push(`in ${MONTHS[+m - 1]} ${y}`)
  } else if (w.year) parts.push(`in ${w.year}`)
  if (w.from || w.to) parts.push(w.from && w.to ? `from ${prettyDate(w.from)} to ${prettyDate(w.to)}` : w.from ? `from ${prettyDate(w.from)} on` : `up to ${prettyDate(w.to!)}`)
  if (w.last) parts.push(`in the last ${w.last} of the table`)
  if (w.weekday) {
    const ds = (Array.isArray(w.weekday) ? w.weekday : [w.weekday]).map((d) => d[0].toUpperCase() + d.slice(1).toLowerCase() + 's')
    parts.push(ds.length === 2 && /^sat/i.test(ds[0]) && /^sun/i.test(ds[1]) ? 'on weekends' : ds.length === 5 && /^mon/i.test(ds[0]) ? 'on weekdays' : `on ${ds.join(' and ')}`)
  }
  if (w.hours) {
    const h = (x: number) => (x === 0 || x === 24 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x}am` : `${x - 12}pm`)
    const [a, b] = w.hours
    parts.push(a === 6 && b === 18 ? 'by day (6am to 6pm)' : a === 18 && b === 6 ? 'at night (6pm to 6am)' : `between ${h(a)} and ${h(b)}`)
  }
  return parts.join(' ')
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }))

/** One condition on a column, in words, and whether it names what is counted ("robberies") or narrows it ("in ward 2", "with a knife"). */
function sayValue(roles: Words, column: string, value: string | string[]): { subject?: string; rest?: string } {
  const c = roles.columns.find((x) => x.name === column)
  const list = Array.isArray(value) ? value : [value]
  // the first of the words that reads after the thing counted ("with a gun", not "gun …")
  const first = (ws?: string[]) => ws && (ws.find((x) => !x.includes('…')) ?? ws[0].replace('…', '').trim())
  const w = (v: string) => first(roles.words[column]?.[v]) ?? first(roles.words[column]?.[Object.keys(roles.words[column] ?? {}).find((k) => k.toUpperCase() === v.toUpperCase()) ?? ''])
  const or = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs.join(' or '))
  if (c?.role === 'what') return { subject: or(list.map((v) => w(v) ?? `${tidy(v)} ${pluralOf(roles.noun || 'row')}`)) }
  if (c?.role === 'where') return { rest: `in ${or(list.map((v) => areaWords(c.label, v)))}` }
  if (c && (c.role === 'how' || c.role === 'when') && list.every((v) => w(v))) return { rest: or(list.map((v) => w(v)!)) }
  return { rest: `with ${c?.label ?? column} ${or(list.map(tidy))}` }
}

function sayNear(near: Query['near']): string | null {
  if (!near) return null
  const [, v] = Object.entries(near).find(([x]) => x !== 'blocks' && x !== 'm') ?? []
  if (v === undefined) return null
  const b = blockWords(String(v))
  const place = b ? `the ${b.said}` : String(v)
  if (near.m) return `within ${near.m} metres of ${place}`
  const n = Number(near.blocks ?? 0)
  return n === 0 ? `on ${place}` : n === 1 ? `on or next to ${place}` : `within ${n} blocks of ${place}`
}

/** A query's conditions in words: what is counted, and the rest ("in ward 2", "near the 1200 block of U Street NW", "in March 2025"). */
export function sayQuery(q: Query, roles: Words): { subject: string | null; rest: string } {
  let subject: string | null = null
  const rest: string[] = []
  for (const [k, v] of Object.entries(q.where ?? {})) {
    const s = sayValue(roles, k, v)
    if (s.subject) subject = subject ? `${subject} (${s.subject})` : s.subject
    if (s.rest) rest.push(s.rest)
  }
  const near = sayNear(q.near)
  if (near) rest.push(near)
  if (q.when) rest.push(describeWhen(q.when))
  return { subject, rest: rest.filter(Boolean).join(' ') }
}

/** A short name for one side of a comparison: the part that differs from the shared question. */
export function sideLabel(side: Query, roles: Words): string {
  const s = sayQuery(side, roles)
  return [s.subject, s.rest].filter(Boolean).join(' ') || 'all'
}

/** The query's conditions, in words, for a line under the answer. */
export function describeQuery(q: Query, roles?: Words): string {
  if (roles) {
    const s = sayQuery(q, roles)
    return [s.subject, s.rest].filter(Boolean).join(' ')
  }
  const parts: string[] = []
  for (const [k, v] of Object.entries(q.where ?? {})) parts.push(`${k} ${Array.isArray(v) ? v.join(' or ') : v}`)
  const near = sayNear(q.near)
  if (near) parts.push(near)
  if (q.when) parts.push(describeWhen(q.when))
  return parts.join(', ')
}

const prettyDate = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number)
  return m ? `${MONTHS[m - 1].slice(0, 3)} ${dd}, ${y}` : d
}

/**
 * The plain answer, from the result alone: a sentence anyone could check
 * against the rows. When the question gave no period, it says which dates the
 * table covers, so a reader knows how current the answer is.
 */
export function phrase(result: Result, q: Query, roles: Words): string {
  if (!result.ok) return `The table can't answer that: ${result.error}`
  const nouns = pluralOf(roles.noun || 'row')
  const { subject, rest } = sayQuery({ ...q, compare: undefined }, roles)
  const what = subject ?? nouns
  const tail = rest ? ` ${rest}` : ''
  const span = result.range && !q.when && !q.compare?.some((s) => s.when) ? ` The table runs from ${prettyDate(result.range.from)} to ${prettyDate(result.range.to)}.` : ''
  const amount = (n: number) => (result.measure === 'count' ? fmt(n) : `${result.measure === 'sum' ? 'a total' : 'an average'} ${roles.columns.find((c) => c.name === result.column)?.label ?? result.column} of ${fmt(n)}`)
  if (result.kind === 'compare' && result.sides) {
    const s = result.sides
    const each = s.map((x) => `${x.label}: ${amount(x.value)}`).join(' · ')
    let diff = ''
    if (s.length === 2) {
      const [a, b] = s
      if (a.value === b.value) diff = ' The same.'
      else {
        const [hi, lo] = a.value > b.value ? [a, b] : [b, a]
        diff = ` The difference: ${fmt(hi.value - lo.value)} more ${hi.label}${lo.value ? ` (${fmt(Math.round(((hi.value - lo.value) / lo.value) * 100))}% more)` : ''}.`
      }
    }
    return `${cap(what)}${tail}. ${cap(each)}.${diff}${span}`
  }
  if (result.kind === 'groups' && result.groups) {
    const by = roles.columns.find((c) => c.name === q.by)
    const name = (v: string) => (by?.role === 'where' ? areaWords(by.label, v) : by?.role === 'what' ? tidy(v) : `${by?.label ?? q.by} ${tidy(v)}`)
    if (!result.groups.length) return `There were no ${what}${tail}, so nothing to rank.${span}`
    const [first, ...others] = result.groups
    return `${cap(what)}${tail}, by ${by?.label ?? q.by}: most in ${name(first.label)} (${amount(first.value)})${others.length ? `, then ${others.map((g) => `${name(g.label)} (${amount(g.value)})`).join(', ')}` : ''}.${span}`
  }
  if (result.measure !== 'count') return `${cap(what)}${tail}: ${amount(result.value)}, from ${fmt(result.matched)} ${result.matched === 1 ? roles.noun : nouns}.${span}`
  const n = result.value
  const outside = result.notes.find((x) => x.startsWith('outside the table'))
  if (outside && n === 0) return `No answer: the table is ${outside.slice('outside the table: it '.length).replace(/^covers/, 'from')}.`
  return `There ${n === 1 ? 'was' : 'were'} ${n === 0 ? 'no' : fmt(n)} ${n === 1 ? (subject ? singular(subject) : roles.noun || 'row') : what}${tail}.${span}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "thefts from cars" → "theft from cars", "car thefts" → "car theft": the first plural word made singular. */
function singular(phrase: string): string {
  const ws = phrase.split(' ')
  const i = ws.findIndex((w) => /[^s]s$/.test(w))
  if (i < 0) return phrase
  ws[i] = /ies$/.test(ws[i]) ? ws[i].slice(0, -3) + 'y' : /(ch|sh|x)es$/.test(ws[i]) ? ws[i].slice(0, -2) : ws[i].slice(0, -1)
  return ws.join(' ')
}

/* ---------- the same query in SQL, for the curious ---------- */

const sqlName = (c: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : `"${c.replace(/"/g, '""')}"`)
const sqlText = (v: string) => `'${String(v).replace(/'/g, "''")}'`

function sqlWhere(q: Query, date?: string): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(q.where ?? {})) {
    const list = Array.isArray(v) ? v : [v]
    out.push(list.length === 1 ? `${sqlName(k)} = ${sqlText(list[0])}` : `${sqlName(k)} IN (${list.map(sqlText).join(', ')})`)
  }
  if (q.near) {
    const [k, v] = Object.entries(q.near).find(([x]) => x !== 'blocks' && x !== 'm') ?? []
    if (k) {
      const b = readBlock(String(v))
      if (q.near.m) out.push(`distance(${sqlName(k)}, ${sqlText(String(v))}) <= ${q.near.m}  -- metres, from that block's rows`)
      else if (b) out.push(`block_street(${sqlName(k)}) = ${sqlText(b.street)} AND block_number(${sqlName(k)}) BETWEEN ${Math.max(0, b.n - Number(q.near.blocks ?? 0) * 100)} AND ${b.n + Number(q.near.blocks ?? 0) * 100}`)
    }
  }
  const w = q.when
  const d = sqlName(w?.column ?? date ?? 'date')
  if (w?.year) out.push(`strftime('%Y', ${d}) = '${w.year}'`)
  if (w?.month) out.push(`strftime('%Y-%m', ${d}) = '${w.month}'`)
  if (w?.from) out.push(`${d} >= '${w.from}'`)
  if (w?.to) out.push(`${d} < date('${w.to}', '+1 day')`)
  if (w?.last) out.push(`${d} > date((SELECT max(${d}) FROM t), '-${w.last}')`)
  if (w?.weekday) {
    const ds = (Array.isArray(w.weekday) ? w.weekday : [w.weekday]).map((x) => WEEKDAYS.findIndex((y) => y.startsWith(x.toLowerCase().slice(0, 3))))
    out.push(`strftime('%w', ${d}) IN (${ds.map((x) => `'${x}'`).join(', ')})`)
  }
  if (w?.hours) {
    const [a, b] = w.hours
    const h = `CAST(strftime('%H', ${d}) AS INTEGER)`
    out.push(a <= b ? `${h} >= ${a} AND ${h} < ${b}` : `(${h} >= ${a} OR ${h} < ${b})`)
  }
  return out
}

/**
 * The query as SQL (SQLite), to read alongside the JSON. Blocks of a street
 * aren't something SQL knows, so near is written with two made-up functions
 * that say what the runner does.
 */
export function toSql(q: Query, roles: Pick<Roles, 'columns'>, table = 't'): string {
  const date = roles.columns.find((c) => c.role === 'when' && c.type === 'date')?.name
  const m = q.sum ? `SUM(${sqlName(q.sum)})` : q.avg ? `AVG(${sqlName(q.avg)})` : 'COUNT(*)'
  const one = (qq: Query, extra?: string) => {
    const where = sqlWhere(qq, date)
    return qq.by
      ? `SELECT ${sqlName(qq.by)}, ${m} AS n FROM ${table}${where.length ? `\nWHERE ${where.join('\n  AND ')}` : ''}\nGROUP BY ${sqlName(qq.by)} ORDER BY n DESC LIMIT ${qq.top ?? 5}`
      : `SELECT ${extra ? `${sqlText(extra)} AS side, ` : ''}${m} AS n FROM ${table}${where.length ? `\nWHERE ${where.join('\n  AND ')}` : ''}`
  }
  if (q.compare) return q.compare.map((s) => one(over(q, s), describeQuery(s) || "all")).join('\nUNION ALL\n')
  return one(q)
}

/** The same query written the same way every time: keys in order, so training rows teach one form. */
export function canonical(q: Query): string {
  const order = (o: Query): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const k of QUERY_KEYS) {
      const v = (o as Record<string, unknown>)[k]
      if (v === undefined) continue
      if (k === 'when') out[k] = Object.fromEntries(WHEN_KEYS.filter((x) => (v as Record<string, unknown>)[x] !== undefined).map((x) => [x, (v as Record<string, unknown>)[x]]))
      else if (k === 'near') {
        const n = v as Record<string, unknown>
        out[k] = Object.fromEntries([...Object.entries(n).filter(([x]) => x !== 'blocks' && x !== 'm'), ...(['blocks', 'm'] as const).filter((x) => n[x] !== undefined).map((x) => [x, n[x]])])
      } else if (k === 'compare') out[k] = (v as Query[]).map(order)
      else out[k] = v
    }
    return out
  }
  return JSON.stringify(order(q))
}

/** Two results that say the same thing: the same number, or the same groups or sides with the same numbers. */
export function sameAnswer(a: Result, b: Result): boolean {
  if (!a.ok || !b.ok || a.kind !== b.kind) return false
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6 * Math.max(1, Math.abs(x))
  if (a.kind === 'number') return close(a.value, b.value)
  const xs = a.groups ?? a.sides ?? []
  const ys = b.groups ?? b.sides ?? []
  return xs.length === ys.length && xs.every((x, i) => close(x.value, ys[i].value) && (a.kind === 'compare' || x.label === ys[i].label))
}
