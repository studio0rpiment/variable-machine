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
/** The trained dream reader: the bases it can be trained from (all Apache 2.0); the Qwen2.5 bases write Chinese, SmolLM2 English only. */
export const READER_BASES = ['Qwen/Qwen2.5-0.5B-Instruct', 'Qwen/Qwen2.5-1.5B-Instruct', 'HuggingFaceTB/SmolLM2-360M-Instruct']
/** How the trained reader's rows are read: each one read on the Data tab first, or all kept unread. */
export type Rows = 'read' | 'keep'
/** The style of the variations: Kandinsky as it is, or with a LoRA trained on someone's own drawings. */
export type Style = 'none' | 'drawings'

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
  /** the reading in Traditional Chinese too (--chinese); off: the installation reads in English */
  chinese: boolean
  /** the combination the one-combination step makes and shows, who-what-when-where */
  combination: Record<Quality, number>
  /** the trained reader: the model whose readings it learns from (the teacher), the base it is trained from, its rows' set, and its name */
  teacher: string
  base: string
  rows: Rows
  readerSet: string
  reader: string
  /** the style: none, or drawings (an image set) made into a latent image and trained */
  style: Style
  drawings: string
}

/** The style's name follows the drawings it is made from: her-drawings → her-style, demo-drawings → demo-style. */
export const styleName = (c: Pick<DreamChoices, 'drawings'>) => `${c.drawings.replace(/-drawings$/, '')}-style`

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
  chinese: false,
  combination: { who: 1, what: 1, when: 1, where: 1 },
  teacher: 'qwen3:4b',
  base: 'Qwen/Qwen2.5-0.5B-Instruct',
  rows: 'read',
  readerSet: 'dream-readings',
  reader: 'dream-reader',
  style: 'drawings',
  drawings: 'her-drawings',
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

/** A quality's label: its Chinese name too only when the reading is in Chinese. */
export const qualityLabel = (q: Quality, c: Pick<DreamChoices, 'chinese'>) => (c.chinese ? `${ZH[q]} ${q}` : q)
