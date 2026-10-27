import { createElement, Fragment, type ReactNode } from 'react'
import { WORDS, type MarkedId } from './words'

/**
 * The page's words, from the tab files in this folder (gesture.md, …). Edit the
 * words there; the names tie them to the page. The build checks every name and
 * placeholder used here against the files (ui/scripts/text.mjs).
 */
export type WordId = keyof typeof WORDS

/** The placeholders in an entry's text: "{n} of {k}" → "n" | "k". */
type Slots<S extends string> = S extends `${string}{${infer K}}${infer R}` ? K | Slots<R> : never
/** The values an entry needs: none, or one for each placeholder. */
type Values<K extends WordId, V> = [Slots<(typeof WORDS)[K]>] extends [never] ? [] : [Record<Slots<(typeof WORDS)[K]>, V>]

const fill = (text: string, values: Record<string, unknown> = {}) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]))

/** An entry as a string: say('gesture.record.count', { n: 12 }) → "12 examples". */
export function say<K extends Exclude<WordId, MarkedId>>(id: K, ...values: Values<K, string | number>): string {
  return fill(WORDS[id], values[0])
}

/**
 * An entry to show, with its `code`, *italic* and **bold**; a placeholder's value
 * can be anything React shows, so code can pass in a command it builds.
 */
export function rich<K extends WordId>(id: K, ...values: Values<K, ReactNode>): ReactNode {
  const v = (values[0] ?? {}) as Record<string, ReactNode>
  const parts = (text: string): ReactNode[] => text.split(/\{(\w+)\}/).map((p, i) => (i % 2 ? v[p] : p))
  const out: ReactNode[] = []
  for (const [i, piece] of WORDS[id].split(/(`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*)/).entries()) {
    if (!piece) continue
    const mark = piece.startsWith('`') ? 'code' : piece.startsWith('**') ? 'b' : piece.startsWith('*') ? 'i' : null
    const inner = mark === 'b' ? piece.slice(2, -2) : mark ? piece.slice(1, -1) : piece
    out.push(createElement(mark ?? Fragment, { key: i }, ...parts(inner)))
  }
  return out
}
