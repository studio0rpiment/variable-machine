import { areaWords as said, blockWords, canonical, runQuery, type ColumnRole, type Prepared, type Query, type Result } from './tableQuery.ts'
import { pluralOf, tidy, type TableProfile } from './tableProfile.ts'

const areaWords = (c: ColumnRole, v: string) => said(c.label, v)

/**
 * Questions → queries, made from a table's roles and its real values, so
 * nobody writes them by hand. Each pattern is a kind of question people ask
 * of a table (how many, near a place, in a period, which has the most, this
 * one or that one) in several phrasings. Every query is run before it is
 * kept: one the table can't answer is dropped, and a share of questions
 * whose honest answer is zero are kept on purpose.
 */

export interface Made {
  question: string
  query: Query
  pattern: string
  /** the answer, computed now; not trained on, but kept to check against */
  result: Result
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The system line every row carries, and every question asked of the trained model. */
export const askSystem = (title: string) => `Write the query that answers this question about the table "${title}". Answer with JSON only.`

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeQuestions(p: Prepared, profile: TableProfile, opts: { rows: number; seed: number }): Made[] {
  const r = rng(opts.seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const chance = (x: number) => r() < x
  const roles = p.roles
  const col = (role: string) => roles.columns.filter((c) => c.role === role)
  const prof = (name: string) => profile.columns.find((c) => c.name === name)
  /** a value, more often a common one, sometimes a rare one */
  const valueOf = (name: string, rare = false) => {
    const top = prof(name)?.top ?? []
    if (!top.length) return null
    if (rare) return pick(top.slice(Math.floor(top.length / 2))).value
    const total = top.reduce((s, t) => s + Math.sqrt(t.n), 0)
    let x = r() * total
    for (const t of top) if ((x -= Math.sqrt(t.n)) <= 0) return t.value
    return top[0].value
  }
  const noun = roles.noun || 'row'
  const nouns = pluralOf(noun)

  const what = col('what')[0]
  const hows = col('how').filter((c) => roles.words[c.name])
  const shift = col('when').find((c) => c.type !== 'date' && roles.words[c.name])
  const areas = col('where').filter((c) => c.place === 'area' && (prof(c.name)?.distinct ?? 99) <= 60 && (prof(c.name)?.missing ?? 1) < 0.2)
  const block = col('where').find((c) => c.place === 'block')
  const hasLatLon = col('where').some((c) => c.place === 'lat') && col('where').some((c) => c.place === 'lon')
  const date = col('when').find((c) => c.type === 'date')
  const dateProf = date ? prof(date.name) : undefined
  const measures = col('how much').filter((c) => c.type === 'number')

  /** what's counted: a kind (OFFENSE ROBBERY) said as "robberies", or the rows themselves */
  const subject = (rare = false): { said: string; where: Record<string, string> } => {
    if (what && chance(0.85)) {
      const v = valueOf(what.name, rare)
      if (v) return { said: pick(roles.words[what.name]?.[v] ?? [`${tidy(v)} ${nouns}`]), where: { [what.name]: v } }
    }
    return { said: chance(0.6) ? nouns : pick([nouns, ...(roles.nouns ?? [])]), where: {} }
  }
  const area = (c = pick(areas), rare = false) => {
    const v = valueOf(c.name, rare)
    return v ? { said: `in ${areaWords(c, v)}`, where: { [c.name]: v }, c, v } : null
  }
  /** a detail, said after what is counted ("robberies with a gun") or, written "gun …", before it ("gun robberies") */
  const how = () => {
    const c = pick(hows)
    const v = valueOf(c.name)
    if (!v) return null
    const w = pick(roles.words[c.name][v] ?? [`with ${c.label} ${tidy(v)}`])
    return { apply: (s: string) => (w.includes('…') ? w.replace('…', s) : `${s} ${w}`), where: { [c.name]: v } }
  }
  const shiftOf = () => {
    if (!shift) return null
    const v = valueOf(shift.name)
    return v ? { said: pick(roles.words[shift.name][v]), where: { [shift.name]: v } } : null
  }

  // periods, from the dates the table really has
  const first = dateProf?.min ? new Date(dateProf.min) : null
  const last = dateProf?.max ? new Date(dateProf.max) : null
  const months: { y: number; m: number }[] = []
  if (first && last) for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); d <= last; d.setUTCMonth(d.getUTCMonth() + 1)) months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 })
  const oneYear = first && last && first.getUTCFullYear() === last.getUTCFullYear()
  const years = [...new Set(months.map((m) => m.y))]
  const mm = (x: { y: number; m: number }) => `${x.y}-${String(x.m).padStart(2, '0')}`
  const period = (): { said: string; when: Query['when'] } | null => {
    if (!date || !months.length) return null
    const k = r()
    if (k < 0.4) {
      const x = pick(months)
      const said = oneYear && chance(0.4) ? `in ${MONTHS[x.m - 1]}` : `in ${MONTHS[x.m - 1]} ${x.y}`
      return { said, when: { month: mm(x) } }
    }
    if (k < 0.55 && years.length) {
      const y = pick(years)
      return { said: pick([`in ${y}`, `during ${y}`, `for ${y}`]), when: { year: y } }
    }
    if (k < 0.72) {
      const d = pick(WEEKDAYS)
      if (chance(0.25)) return { said: pick(['on weekends', 'on the weekend', 'on Saturdays and Sundays']), when: { weekday: ['saturday', 'sunday'] } }
      return { said: pick([`on ${cap(d)}s`, `on a ${cap(d)}`]), when: { weekday: d } }
    }
    if (k < 0.82) {
      const [n, u, said] = pick([
        [30, 'days', 'in the last 30 days'],
        [1, 'week', 'in the most recent week'],
        [1, 'month', 'in the latest month of the data'],
        [90, 'days', 'in the last 90 days'],
        [7, 'days', 'in the last 7 days'],
      ] as const)
      return { said, when: { last: n === 1 ? u : `${n} ${u}` } }
    }
    if (k < 0.87 && dateProf?.times && chance(0.5)) {
      const a = Math.floor(r() * 24)
      const b = (a + 2 + Math.floor(r() * 8)) % 24
      const h = (x: number) => (x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x}${pick(['am', ' am', 'a.m.'])}` : `${x - 12}${pick(['pm', ' pm', 'p.m.'])}`)
      return { said: pick([`between ${h(a)} and ${h(b)}`, `from ${h(a)} to ${h(b)}`]), when: { hours: [a, b] } }
    }
    if (k < 0.87 && years.length) {
      const y = pick(years)
      const [name, m1, m2] = pick([['spring', 3, 5], ['summer', 6, 8], ['fall', 9, 11], ['autumn', 9, 11]] as const)
      const end = new Date(Date.UTC(y, m2, 0)).getUTCDate()
      return { said: oneYear && chance(0.5) ? pick([`in the ${name}`, `over the ${name}`, `this ${name}`]) : `in the ${name} of ${y}`, when: { from: `${y}-${String(m1).padStart(2, '0')}-01`, to: `${y}-${String(m2).padStart(2, '0')}-${end}` } }
    }
    if (k < 0.92 && dateProf?.times) {
      const [h, said] = pick([
        [[22, 6], pick(['between 10pm and 6am', 'late at night'])],
        [[18, 6], pick(['at night', 'after dark', 'during the night'])],
        [[6, 18], pick(['during the day', 'in daytime', 'in daylight hours'])],
        [[0, 4], 'between midnight and 4am'],
        [[17, 20], 'between 5pm and 8pm'],
        [[7, 10], 'during the morning rush (7 to 10am)'],
      ] as const)
      return { said, when: { hours: [h[0], h[1]] } }
    }
    // a range of days within one month
    const x = pick(months)
    const a = 1 + Math.floor(r() * 14)
    const b = a + 3 + Math.floor(r() * 12)
    const dd = (d: number) => `${mm(x)}-${String(d).padStart(2, '0')}`
    return { said: `between ${MONTHS[x.m - 1]} ${a} and ${MONTHS[x.m - 1]} ${b}, ${x.y}`, when: { from: dd(a), to: dd(b) } }
  }
  const nearOf = () => {
    if (!block) return null
    const v = valueOf(block.name)
    const full = v ? blockWords(v) : null
    if (!full) return null
    // as people write an address: "1400 U St NW", with or without "block of"
    const short = full.said.replace(/ Street\b/, ' St').replace(/ Avenue\b/, ' Ave').replace(/ Road\b/, ' Rd').replace(/ Place\b/, ' Pl')
    const b = { ...full, said: chance(0.3) ? short : full.said }
    if (chance(0.25)) {
      const bare = b.said.replace(' block of', '')
      return chance(0.5) ? { said: pick([`near ${bare}`, `around ${bare}`]), near: { [block.name]: b.query, blocks: 1 } } : { said: pick([`at ${bare}`, `on the ${b.said}`]), near: { [block.name]: b.query, blocks: 0 } }
    }
    const k = r()
    if (hasLatLon && k < 0.2) {
      const m = pick([100, 200, 250, 300, 400, 500, 800, 1000])
      return { said: pick([`within ${m} meters of the ${b.said}`, `within ${m}m of the ${b.said}`]), near: { [block.name]: b.query, m } }
    }
    if (k < 0.45) return { said: pick([`on the ${b.said}`, `at the ${b.said}`]), near: { [block.name]: b.query, blocks: 0 } }
    if (k < 0.75) return { said: pick([`near the ${b.said}`, `around the ${b.said}`, `close to the ${b.said}`]), near: { [block.name]: b.query, blocks: 1 } }
    const n = 2 + Math.floor(r() * 4)
    return { said: pick([`within ${n} blocks of the ${b.said}`, `within ${n} blocks of ${b.said.replace(' block of', '')}`]), near: { [block.name]: b.query, blocks: n } }
  }

  type Maker = () => { question: string; query: Query } | null
  const patterns: [string, number, Maker][] = []
  const count = (s: string) => pick([`How many ${s}?`, `How many ${s} were there?`, `Count the ${s}.`, `What's the number of ${s}?`, `how many ${s}`])

  patterns.push(['count', 1, () => {
    const s = subject()
    return { question: count(s.said), query: { where: s.where } }
  }])
  if (areas.length)
    patterns.push(['count · where', 3, () => {
      const s = subject()
      const a = area()
      return a && { question: count(`${s.said} ${a.said}`), query: { where: { ...s.where, ...a.where } } }
    }])
  if (date)
    patterns.push(['count · when', 3, () => {
      const s = subject()
      const t = period()
      return t && { question: count(`${s.said} ${t.said}`), query: { where: s.where, when: t.when } }
    }])
  if (areas.length && date)
    patterns.push(['count · where · when', 4, () => {
      const s = subject()
      const a = area()
      const t = period()
      return a && t && { question: count(`${s.said} ${chance(0.5) ? `${a.said} ${t.said}` : `${t.said} ${a.said}`}`), query: { where: { ...s.where, ...a.where }, when: t.when } }
    }])
  if (hows.length)
    patterns.push(['count · how', 2, () => {
      const s = subject()
      const h = how()
      const a = areas.length && chance(0.5) ? area() : null
      return h && { question: count(`${h.apply(s.said)}${a ? ` ${a.said}` : ''}`), query: { where: { ...s.where, ...h.where, ...a?.where } } }
    }])
  if (shift)
    patterns.push(['count · shift', 1.5, () => {
      const s = subject()
      const h = shiftOf()
      const a = areas.length && chance(0.5) ? area() : null
      return h && { question: count(`${s.said} ${h.said}${a ? ` ${a.said}` : ''}`), query: { where: { ...s.where, ...h.where, ...a?.where } } }
    }])
  if (block)
    patterns.push(['near', 4, () => {
      const s = subject()
      const n = nearOf()
      const t = date && chance(0.4) ? period() : null
      return n && { question: count(`${s.said} ${n.said}${t ? ` ${t.said}` : ''}`), query: { where: s.where, near: n.near, ...(t && { when: t.when }) } }
    }])
  if (areas.length)
    patterns.push(['compare · places', 2.5, () => {
      const s = subject()
      const c = pick(areas)
      const a = area(c)
      const b = area(c)
      if (!a || !b || a.v === b.v) return null
      const t = date && chance(0.3) ? period() : null
      const q = pick([
        `Were there more ${s.said} ${a.said} or ${b.said}${t ? ` ${t.said}` : ''}?`,
        `Compare ${s.said} ${a.said} and ${b.said}${t ? ` ${t.said}` : ''}.`,
        `${cap(s.said)}${t ? ` ${t.said}` : ''}: ${areaWords(c, a.v)} vs ${areaWords(c, b.v)}?`,
        `Which had more ${s.said}${t ? ` ${t.said}` : ''}, ${areaWords(c, a.v)} or ${areaWords(c, b.v)}?`,
      ])
      return { question: q, query: { where: s.where, ...(t && { when: t.when }), compare: [{ where: a.where }, { where: b.where }] } }
    }])
  if (date && months.length > 1)
    patterns.push(['compare · periods', 2, () => {
      const s = subject()
      const a = areas.length && chance(0.4) ? area() : null
      if (chance(0.3)) {
        const q = pick([`Do more ${s.said}${a ? ` ${a.said}` : ''} happen on weekends or weekdays?`, `${cap(s.said)}${a ? ` ${a.said}` : ''}: weekends vs weekdays?`])
        return { question: q, query: { where: { ...s.where, ...a?.where }, compare: [{ when: { weekday: ['saturday', 'sunday'] } }, { when: { weekday: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] } }] } }
      }
      const x = pick(months)
      const y = pick(months)
      if (mm(x) === mm(y)) return null
      const said = (z: typeof x) => (oneYear && chance(0.4) ? MONTHS[z.m - 1] : `${MONTHS[z.m - 1]} ${z.y}`)
      const q = pick([
        `Were there more ${s.said}${a ? ` ${a.said}` : ''} in ${said(x)} or ${said(y)}?`,
        `Compare ${s.said}${a ? ` ${a.said}` : ''} in ${said(x)} and ${said(y)}.`,
        `${cap(s.said)}${a ? ` ${a.said}` : ''}: ${said(x)} vs ${said(y)}?`,
      ])
      return { question: q, query: { where: { ...s.where, ...a?.where }, compare: [{ when: { month: mm(x) } }, { when: { month: mm(y) } }] } }
    }])
  if (what && (prof(what.name)?.distinct ?? 0) > 1)
    patterns.push(['compare · kinds', 2, () => {
      const v1 = valueOf(what.name)
      const v2 = valueOf(what.name)
      if (!v1 || !v2 || v1 === v2) return null
      const w = (v: string) => pick(roles.words[what.name]?.[v] ?? [`${tidy(v)} ${nouns}`])
      const a = areas.length && chance(0.6) ? area() : null
      const t = !a && date && chance(0.5) ? period() : null
      const where = a?.said ?? t?.said ?? ''
      const q = pick([`Were there more ${w(v1)} or ${w(v2)}${where ? ` ${where}` : ''}?`, `Compare ${w(v1)} and ${w(v2)}${where ? ` ${where}` : ''}.`, `Which is more common${where ? ` ${where}` : ''}: ${w(v1)} or ${w(v2)}?`])
      return { question: q, query: { ...(a && { where: a.where }), ...(t && { when: t.when }), compare: [{ where: { [what.name]: v1 } }, { where: { [what.name]: v2 } }] } }
    }])
  if (dateProf?.times)
    patterns.push(['compare · day and night', 1.5, () => {
      const s = subject()
      const a = areas.length && chance(0.5) ? area() : null
      const q = pick([`Do more ${s.said}${a ? ` ${a.said}` : ''} happen during the day or at night?`, `${cap(s.said)}${a ? ` ${a.said}` : ''}: day vs night?`, `Are ${s.said}${a ? ` ${a.said}` : ''} more common by day or by night?`])
      return { question: q, query: { where: { ...s.where, ...a?.where }, compare: [{ when: { hours: [6, 18] } }, { when: { hours: [18, 6] } }] } }
    }])
  else if (shift && roles.words[shift.name]) {
    const vals = Object.keys(roles.words[shift.name])
    const dayVal = vals.find((v) => /^day/i.test(v))
    if (dayVal && vals.length > 1)
      patterns.push(['compare · day and night', 1.5, () => {
        const s = subject()
        const q = pick([`Do more ${s.said} happen during the day or at night?`, `${cap(s.said)}: day vs night?`])
        return { question: q, query: { where: s.where, compare: [{ where: { [shift.name]: dayVal } }, { where: { [shift.name]: vals.filter((v) => v !== dayVal) } }] } }
      }])
  }
  if (areas.length)
    patterns.push(['most · where', 2, () => {
      const s = subject()
      const c = pick(areas)
      const t = date && chance(0.4) ? period() : null
      const q = pick([`Which ${c.label} had the most ${s.said}${t ? ` ${t.said}` : ''}?`, `Where were ${s.said} most common${t ? ` ${t.said}` : ''}, by ${c.label}?`, `Rank the ${pluralOf(c.label)} by ${s.said}${t ? ` ${t.said}` : ''}.`])
      return { question: q, query: { where: s.where, ...(t && { when: t.when }), by: c.name } }
    }])
  if (what && areas.length)
    patterns.push(['most · what', 1.5, () => {
      const a = area()
      const t = date && chance(0.4) ? period() : null
      if (!a) return null
      const label = what.label
      const q = pick([`What were the most common ${pluralOf(label)} ${a.said}${t ? ` ${t.said}` : ''}?`, `Which ${label} happened most ${a.said}${t ? ` ${t.said}` : ''}?`, `Top ${pluralOf(label)} ${a.said}${t ? ` ${t.said}` : ''}?`])
      return { question: q, query: { where: a.where, ...(t && { when: t.when }), by: what.name } }
    }])
  for (const m of measures)
    patterns.push([`sum · ${m.name}`, 1, () => {
      const a = areas.length ? area() : null
      const avg = chance(0.5)
      const q = avg ? pick([`What is the average ${m.label}${a ? ` ${a.said}` : ''}?`, `Average ${m.label}${a ? ` ${a.said}` : ''}?`]) : pick([`What is the total ${m.label}${a ? ` ${a.said}` : ''}?`, `Add up the ${m.label}${a ? ` ${a.said}` : ''}.`])
      return { question: q, query: { ...(a && { where: a.where }), ...(avg ? { avg: m.name } : { sum: m.name }) } }
    }])
  // questions whose true answer is none: a rare kind, in a small place and a short time
  if (areas.length && date)
    patterns.push(['zero', 1.5, () => {
      const s = subject(true)
      const n = block && chance(0.5) ? nearOf() : null
      const a = n ? null : area(pick(areas), true)
      const t = period()
      const where = n?.said ?? a?.said
      return where && t ? { question: count(`${s.said} ${where} ${t.said}`), query: { where: { ...s.where, ...a?.where }, ...(n && { near: n.near }), when: t.when } } : null
    }])

  const total = patterns.reduce((s, x) => s + x[1], 0)
  const out: Made[] = []
  const seen = new Set<string>()
  let zeros = 0
  for (let tries = 0; out.length < opts.rows && tries < opts.rows * 30; tries++) {
    let x = r() * total
    const [name, , make] = patterns.find((pt) => (x -= pt[1]) <= 0) ?? patterns[0]
    const made = make()
    if (!made) continue
    let question = made.question.replace(/\s+/g, ' ').trim()
    // varied writing: some questions in lower case, some without the question mark
    if (chance(0.15)) question = question.toLowerCase()
    if (chance(0.15)) question = question.replace(/[?.]$/, '')
    if (seen.has(question.toLowerCase())) continue
    const query = clean(made.query)
    const result = runQuery(p, query, 0)
    if (!result.ok) continue
    const zero = result.kind === 'number' && result.value === 0
    // keep zero answers to about one in ten, outside the pattern made for them
    if (zero && name !== 'zero' && zeros > out.length * 0.1) continue
    if (name === 'zero' && !zero && chance(0.6)) continue
    if (zero) zeros++
    seen.add(question.toLowerCase())
    out.push({ question, query, pattern: name, result })
  }
  return out
}

/** Leave out what's empty, so the query is as short as it can be. */
function clean(q: Query): Query {
  const out: Query = {}
  if (q.where && Object.keys(q.where).length) out.where = q.where
  if (q.near) out.near = q.near
  if (q.when && Object.keys(q.when).length) out.when = q.when
  if (q.by) out.by = q.by
  if (q.sum) out.sum = q.sum
  if (q.avg) out.avg = q.avg
  if (q.compare) out.compare = q.compare.map(clean)
  return JSON.parse(canonical(out)) as Query
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
