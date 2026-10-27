import { pluralOf, readBlock, readDate, tidy, type ColumnRole, type ColumnType, type Role, type Roles, type Table } from './tableQuery.ts'

/**
 * What's in a table: for each column its type, how many different values,
 * how much is missing, examples and the most common values, and a guess at
 * its role in a question (what, where, when, how much, how, or an id to
 * leave out). The Data tab shows this as "what's in this table"; the guesses
 * become roles.json, which the student can change, and the question
 * generator reads.
 */

export interface ColumnProfile {
  name: string
  type: ColumnType
  distinct: number
  /** share of rows with nothing in this column, 0 to 1 */
  missing: number
  examples: string[]
  /** the most common values and how many rows have each (up to 60, so a column of a few kinds has them all) */
  top: { value: string; n: number }[]
  /** numbers: smallest and largest; dates: first and last day */
  min?: string
  max?: string
  /** dates: some have a time of day, so hours can be asked about */
  times?: boolean
  guess: Role
  /** why it was guessed, in a few words */
  why: string
}

export interface TableProfile {
  table: string
  rows: number
  columns: ColumnProfile[]
  /** the main date column's first and last day */
  range: { column: string; from: string; to: string } | null
  title?: string
  license?: string
  page?: string
  source?: string
}

const ID_NAME = /(^|_)(id|objectid|object_id|fid|gid|uuid|guid|ccn|record_id|octo_record_id|globalid|case_?number|incident_?number)$|^id_|_id$/i
const LAT = /^(lat|latitude|y_?lat|.*_lat|.*latitude)$/i
const LON = /^(lon|lng|long|longitude|x_?lon|.*_lon|.*_lng|.*longitude)$/i
const PROJECTED = /^(x|y|[xy]_?block|[xy]_?coord(inate)?|easting|northing|[xy]cord)$/i
const AREA = /ward|district|neighbou?rhood|cluster|precinct|tract|zip|postal|^anc$|^psa$|quadrant|borough|county|city|^state$|community|^bid$|block_?group|zone|beat|sector|region/i
const ADDRESS = /block|address|street|location|intersection/i
const WHEN_TEXT = /shift|time_?of_?day|season|period|daypart/i
const WHAT_NAME = /offen[cs]e|crime|type|category|kind|species|class|violation|description|status|genus|condition|use|activity/i

const isNum = (v: string) => v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, '')))

/** A plain name for a column: REPORT_DAT → report date, NEIGHBORHOOD_CLUSTER → neighborhood cluster, PSA → PSA. */
export { pluralOf, tidy }

export function columnLabel(name: string): string {
  if (/^[A-Z]{2,3}$/.test(name)) return name
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w) => ({ dat: 'date', dt: 'date', num: 'number', cnt: 'count', amt: 'amount', qty: 'quantity', desc: 'description' })[w] ?? w)
    .join(' ')
    .trim()
}

export function profileTable(table: Table, meta: Pick<TableProfile, 'table' | 'title' | 'license' | 'page' | 'source'>): TableProfile {
  const n = table.rows.length
  const columns: ColumnProfile[] = table.columns.map((name, i) => {
    const counts = new Map<string, number>()
    let missing = 0
    for (const r of table.rows) {
      const v = (r[i] ?? '').trim()
      if (!v) missing++
      else counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const filled = n - missing
    const values = [...counts.keys()]
    const sampleVals = values.slice(0, 400)
    const dates = sampleVals.map(readDate)
    const dateShare = sampleVals.length ? dates.filter(Boolean).length / sampleVals.length : 0
    const numShare = sampleVals.length ? sampleVals.filter(isNum).length / sampleVals.length : 0
    const blockShare = sampleVals.length ? sampleVals.filter((v) => /^\s*\d+\s*-\s*\d+\s+block\s+of\s+/i.test(v) || (ADDRESS.test(name) && readBlock(v))).length / sampleVals.length : 0
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([value, c]) => ({ value, n: c }))
    let type: ColumnType = 'text'
    if (dateShare > 0.8 && !isNum(sampleVals[0] ?? '')) type = 'date'
    else if (LAT.test(name) || LON.test(name) || AREA.test(name) || blockShare > 0.6) type = 'place'
    else if (numShare > 0.95) type = 'number'
    const p: ColumnProfile = { name, type, distinct: counts.size, missing: n ? missing / n : 0, examples: top.slice(0, 3).map((t) => t.value), top, guess: 'other', why: '' }
    if (type === 'number') {
      const nums = values.map((v) => Number(v.replace(/,/g, '')))
      p.min = String(Math.min(...nums))
      p.max = String(Math.max(...nums))
    }
    if (type === 'date') {
      const ts = values.map(readDate).filter((d): d is NonNullable<typeof d> => !!d)
      const lo = Math.min(...ts.map((d) => d.t))
      const hi = Math.max(...ts.map((d) => d.t))
      p.min = new Date(lo).toISOString().slice(0, 10)
      p.max = new Date(hi).toISOString().slice(0, 10)
      p.times = ts.some((d) => d.hour !== null)
    }
    // the role
    const unique = filled > 20 && counts.size >= filled * 0.95
    if (!counts.size) [p.guess, p.why] = ['other', 'empty in every row']
    else if (LAT.test(name) && type !== 'text') [p.guess, p.why] = ['where', 'latitude']
    else if (LON.test(name) && type !== 'text') [p.guess, p.why] = ['where', 'longitude']
    else if (PROJECTED.test(name)) [p.guess, p.why] = ['other', 'map coordinates in another system']
    else if (ID_NAME.test(name) || (unique && type !== 'date' && type !== 'number' && !ADDRESS.test(name))) [p.guess, p.why] = ['id', unique ? 'a different value in every row' : 'its name says id']
    else if (type === 'date') [p.guess, p.why] = ['when', p.times ? 'dates with times' : 'dates']
    else if (blockShare > 0.6) [p.guess, p.why] = ['where', 'blocks of a street']
    else if (AREA.test(name)) [p.guess, p.why] = ['where', 'an area']
    else if (ADDRESS.test(name)) [p.guess, p.why] = ['where', 'addresses']
    else if (WHEN_TEXT.test(name) && counts.size <= 24) [p.guess, p.why] = ['when', 'a part of the day or year']
    else if (type === 'number' && unique && counts.size === filled && Number(p.min) >= 0 && Number.isInteger(Number(p.max)) && Number(p.max) - Number(p.min) < filled * 1.5) [p.guess, p.why] = ['id', 'numbers that count up, one per row']
    else if (type === 'number') [p.guess, p.why] = ['how much', 'a number to add up or average']
    else if (counts.size >= 2 && counts.size <= 60) [p.guess, p.why] = ['how', 'a few kinds of value']
    else [p.guess, p.why] = ['other', counts.size < 2 ? 'the same in every row' : 'many different values']
    return p
  })
  // The main "what": the few-kinds column whose name says what each row is, else the one with the most kinds.
  const kinds = columns.filter((c) => c.guess === 'how')
  const what = kinds.find((c) => WHAT_NAME.test(c.name)) ?? [...kinds].sort((a, b) => b.distinct - a.distinct)[0]
  if (what) [what.guess, what.why] = ['what', WHAT_NAME.test(what.name) ? 'what each row is' : 'the most kinds of value']
  const date = columns.find((c) => c.guess === 'when' && c.type === 'date')
  return { ...meta, rows: n, columns, range: date ? { column: date.name, from: date.min!, to: date.max! } : null }
}

/* ---------- the words people use ---------- */

/**
 * Common words for coded values in public tables, as a question would say
 * them (plural, the way "how many …" asks). Keyed by the value as the table
 * writes it, upper case. The student can change these in roles.json.
 */
const WORDS: Record<string, string[]> = {
  HOMICIDE: ['homicides', 'murders', 'killings'],
  'THEFT/OTHER': ['other thefts', 'thefts of other things'],
  'THEFT F/AUTO': ['thefts from cars', 'car break-ins', 'thefts from autos'],
  'MOTOR VEHICLE THEFT': ['car thefts', 'stolen cars', 'motor vehicle thefts'],
  ROBBERY: ['robberies', 'muggings', 'holdups'],
  'ASSAULT W/DANGEROUS WEAPON': ['assaults with a dangerous weapon', 'armed assaults', 'aggravated assaults'],
  BURGLARY: ['burglaries', 'break-ins', 'home burglaries'],
  'SEX ABUSE': ['sex abuse cases', 'sexual assaults'],
  ARSON: ['arsons', 'arson fires', 'fires set on purpose'],
  GUN: ['with a gun', 'with a firearm', 'involving a gun', 'gun …', 'armed …'],
  KNIFE: ['with a knife', 'involving a knife', 'with a blade', 'knife …'],
  OTHERS: ['with some other weapon or none', 'without a gun or knife'],
  DAY: ['during the day shift', 'in the daytime shift', 'on the day shift'],
  EVENING: ['during the evening shift', 'in the evening', 'on the evening shift'],
  MIDNIGHT: ['during the midnight shift', 'overnight', 'on the overnight shift'],
}

/** Other words for every row of a table, as questions say them: "how many crimes …". */
const NOUNS: Record<string, string[]> = { incident: ['crimes', 'offenses', 'reported crimes', 'incidents reported'], tree: ['street trees'], crash: ['collisions', 'accidents'], violation: ['citations'], request: ['311 requests', 'service requests'] }

/** What one row is, guessed from the table's name: an incident, a tree, a crash. */
export function guessNoun(title = ''): string {
  const t = title.toLowerCase()
  for (const [re, noun] of [
    [/crime|incident|police|offen/, 'incident'],
    [/tree/, 'tree'],
    [/crash|collision/, 'crash'],
    [/permit/, 'permit'],
    [/violation|citation|ticket/, 'violation'],
    [/complaint|311|request/, 'request'],
    [/inspection/, 'inspection'],
    [/school/, 'school'],
    [/librar/, 'library'],
    [/restaurant|food/, 'restaurant'],
  ] as const)
    if (re.test(t)) return noun
  return 'row'
}

/** Roles from the guesses, with the words for each coded value. */
export function rolesFromProfile(p: TableProfile): Roles {
  const noun = guessNoun(`${p.title ?? ''} ${p.table}`)
  const columns: ColumnRole[] = p.columns.map((c) => ({
    name: c.name,
    role: c.guess,
    type: c.type,
    label: columnLabel(c.name),
    ...(c.guess === 'where' && { place: c.why === 'latitude' ? 'lat' : c.why === 'longitude' ? 'lon' : c.why === 'blocks of a street' ? 'block' : c.why === 'addresses' ? 'address' : 'area' }),
  }))
  return { table: p.table, noun, nouns: NOUNS[noun] ?? [], columns, words: wordsFor(p, columns, noun), ...(p.title && { title: p.title }), ...(p.license && { license: p.license }), ...(p.page && { page: p.page }), ...(p.source && { source: p.source }) }
}

/** The words a question would use for each value of the what, how and when-by-name columns. */
export function wordsFor(p: TableProfile, columns: ColumnRole[], noun: string): Roles['words'] {
  const out: Roles['words'] = {}
  for (const c of columns) {
    if (!['what', 'how'].includes(c.role) && !(c.role === 'when' && c.type !== 'date')) continue
    const prof = p.columns.find((x) => x.name === c.name)
    if (!prof || prof.distinct > 60) continue
    const vals: Record<string, string[]> = {}
    for (const { value } of prof.top) {
      const known = WORDS[value.toUpperCase()]
      if (known) vals[value] = known
      else if (c.role === 'what') vals[value] = [`${tidy(value)} ${pluralOf(noun)}`]
      else if (c.role === 'how') vals[value] = [`with ${c.label} ${tidy(value)}`]
      else vals[value] = [`in the ${tidy(value)} ${c.label}`]
    }
    out[c.name] = vals
  }
  return out
}
