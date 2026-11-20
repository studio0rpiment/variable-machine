import { useSyncExternalStore } from 'react'

/**
 * The decisions of the dream reading, followed as a project: each changes the
 * route through Variable Machine or what the installation shows. Kept in this
 * browser (localStorage), so a reload keeps the route; what each decision
 * made is in the workspace (workspace/dreams/<name>, and the image sets).
 */

export const QUALITIES = ['who', 'what', 'when', 'where'] as const
export type Quality = (typeof QUALITIES)[number]
export const ZH: Record<Quality, string> = { who: '誰', what: '什麼', when: '何時', where: '何地' }

/** Where the cards come from: the student's own pictures, or a demo deck drawn from prompts. */
export type Cards = 'own' | 'demo'
/** How a combination's variations are drawn: the four cards mixed, or the cards with the interpretation's picture sentence. */
export type DrawWith = 'cards' | 'prior'
/** When combinations are made: all of them before the show (and any missing in the room), or only in the room. */
export type Ahead = 'all' | 'live'

/** The texts from the library, each brought in with its own data raw command. */
export const LIBRARY = ['zhougong-jiemeng', 'wangfu-menglie', 'liezi-zh', 'liezi-dreams', 'zhuangzi', 'freud-dreams', 'jung-unconscious', 'kuunmong', 'dream-incubation'] as const
export type LibraryText = (typeof LIBRARY)[number]
/** The language models that can write an interpretation (any in Ollama works on the command line); none is the passages alone. */
export const WRITERS = ['qwen3:4b', 'qwen3:1.7b', 'none']
/** The models that can find a combination's nearest passages. */
export const EMBEDDERS = ['nomic-embed-text', 'mxbai-embed-large']

export interface DreamChoices {
  /** the dream folder followed (workspace/dreams/<name>) */
  name: string
  cards: Cards
  /** the student's own image sets, one per quality */
  sets: Record<Quality, string>
  /** the demo deck's prefix: images/<prefix>-who … */
  demo: string
  /** the guide texts from the library */
  library: LibraryText[]
  /** the student's own texts, uploaded: uploads/<file> */
  own: string[]
  embed: string
  writer: string
  drawWith: DrawWith
  variations: number
  ahead: Ahead
  /** in the room, the visitor's own words are read into a new interpretation (a minute's wait), or only kept */
  readWords: boolean
  /** the combination the one-combination step makes and shows, who-what-when-where */
  combination: Record<Quality, number>
}

const KEY = 'variable-machine.dream'
const DEFAULTS: DreamChoices = {
  name: 'dream',
  cards: 'demo',
  sets: { who: '', what: '', when: '', where: '' },
  demo: 'dream-demo',
  library: ['zhougong-jiemeng', 'wangfu-menglie', 'liezi-dreams'],
  own: [],
  embed: 'nomic-embed-text',
  writer: 'qwen3:4b',
  drawWith: 'cards',
  variations: 2,
  ahead: 'all',
  readWords: false,
  combination: { who: 1, what: 1, when: 1, where: 1 },
}

let choices: DreamChoices = DEFAULTS
try {
  choices = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  // blocked storage: the defaults, for this visit
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

export const useDreamChoices = () => useSyncExternalStore(subscribe, () => choices)
export const dreamChoices = () => choices

export function chooseDream<K extends keyof DreamChoices>(k: K, v: DreamChoices[K]) {
  if (choices[k] === v) return
  choices = { ...choices, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(choices))
  } catch {
    // not remembered; still applies now
  }
  listeners.forEach((l) => l())
}

/** Add a guide text, or take it away; one stays. */
export function toggleText(k: 'library' | 'own', v: string) {
  const list = choices[k] as string[]
  const has = list.includes(v)
  if (has && choices.library.length + choices.own.length === 1) return
  chooseDream(k, (has ? list.filter((x) => x !== v) : [...list, v]) as DreamChoices[typeof k])
}

export function chooseSet(q: Quality, set: string) {
  chooseDream('sets', { ...choices.sets, [q]: set })
}
