/**
 * How `reader check` marks a reader's answers, with nothing it needs from the
 * helper: an answer read as JSON, values compared as a person would, and the
 * JSON schema the stand-in is held to. Kept apart from reader.ts so the tests
 * (../tests/score.test.ts) run on it alone.
 */

export type Fields = Record<string, unknown>

/** The answer as a JSON object, or null: the whole text, or the first {…} in it. */
export function asObject(text: string): Fields | null {
  for (const t of [text, /\{[\s\S]*\}/.exec(text)?.[0] ?? '']) {
    try {
      const v = JSON.parse(t) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Fields
    } catch {
      /* not this one */
    }
  }
  return null
}

/** Values compared as a person would read them: case, spacing and order in a list don't count; empty, none and unknown are the same. */
export function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map(norm).filter(Boolean).sort().join('|')
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v).trim().toLowerCase().replace(/\s+/g, ' ')
  return /^(none|null|n\/a|unknown|-)$/.test(s) ? '' : /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s
}

const SMALL_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'on', 'in', 'is', 'was', 'be', 'and', 'or', 'our', 'your', 'my', 'what', 'about', 'with', 'it', 'this', 'that'])
const content = (s: string) => s.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((w) => w && !SMALL_WORDS.has(w))

/**
 * Right, as a person would mark it. A short value must match. A phrase of
 * three words or more (an ask, a summary) is right when every content word of
 * one is in the other: "confirm invoice paid" for "confirm the invoice was
 * paid", but not "meet about a new website" for "insights on building websites".
 */
export function same(got: unknown, want: unknown): boolean {
  const g = norm(got)
  const w = norm(want)
  if (g === w) return true
  const [a, b] = [content(g), content(w)]
  if (!a.length || !b.length || (a.length < 3 && b.length < 3)) return false
  const [short, long] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)]
  return short.every((x) => long.has(x))
}

/** A JSON schema with the fields, typed from the dataset's own answers. */
export function schemaFor(fields: string[], answers: Fields[]) {
  const type = (k: string) => {
    const v = answers.map((a) => a[k]).find((x) => x !== null && x !== undefined)
    return Array.isArray(v) ? { type: 'array', items: { type: 'string' } } : typeof v === 'number' ? { type: 'number' } : typeof v === 'boolean' ? { type: 'boolean' } : { type: 'string' }
  }
  return { type: 'object', properties: Object.fromEntries(fields.map((k) => [k, type(k)])), required: fields }
}
