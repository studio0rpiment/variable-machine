import { useSyncExternalStore } from 'react'

/**
 * The decisions of the research bot, followed as a project: each changes the
 * route through Variable Machine or what the student ends up with. Kept in
 * this browser (localStorage), so a reload keeps the route; what each decision
 * made is in the workspace (workspace/research/<folder>, and the sets and
 * models made from it).
 */

/** What you take away: a reading list, or a point of view (a small model trained on your decisions). */
export type Take = 'list' | 'view'
/** How a point of view is trained: from all your decisions (Train), or only from where you overrode the screener (Prefer). */
export type TrainFrom = 'all' | 'overrides'
/** Where it searches. Europeana is planned (it needs a key; see the shared notes' research-sources-check.md); the rest are built. */
export type Source = 'scholarship' | 'feeds' | 'patents' | 'archives' | 'newspapers' | 'europeana'
export const SOURCES: Source[] = ['scholarship', 'patents', 'archives', 'newspapers', 'europeana', 'feeds']
export const BUILT_SOURCES = new Set<Source>(['scholarship', 'feeds', 'patents', 'archives', 'newspapers'])
/** The flag on papers search for each source besides scholarship and feeds. */
export const SOURCE_FLAG: Partial<Record<Source, string[]>> = { archives: ['--archive'], newspapers: ['--newspapers'], patents: ['--patents', 'us'] }
/** The fields searches can be written for (papers search --fields); an item's field is its source's label. */
export type Field = 'humanities' | 'sciences' | 'technology'
export const FIELD_LIST: Field[] = ['humanities', 'sciences', 'technology']
/** What your library brings: its proxy for links, keys you hold, your own PDFs. */
export type Library = 'proxy' | 'keys' | 'copies'
export const LIBRARY_LIST: Library[] = ['proxy', 'keys', 'copies']
/** The Ollama models a role can be played by. */
export const ROLE_MODELS = ['qwen3:4b', 'qwen3:1.7b']
/** The models that can rank (papers screen --embed). */
export const RANKERS = ['nomic-embed-text', 'mxbai-embed-large']

export interface ResearchChoices {
  take: Take
  trainFrom: TrainFrom
  /** the research folder followed (workspace/research/<folder>); empty until a search makes one */
  folder: string
  sources: Source[]
  writer: string
  screener: string
  summariser: string
  /** the ranker (papers screen --embed) */
  ranker: string
  /** how many of the closest items the screener reads (papers screen --top) */
  top: number
  /** a second screener on the same items, compared in papers check */
  second: boolean
  secondScreener: string
  summaries: boolean
  /** summaries from the full text (papers summarise --full-text), not the abstracts */
  fullText: boolean
  /** the fields searches are written for; none is no pairing */
  fields: Field[]
  /** what your library brings */
  library: Library[]
  /** whose decisions a point of view learns: yours, or the class's, pooled (papers pool) */
  whose: 'mine' | 'class'
  /** the base a point of view is trained on */
  base: string
  /** where the point of view runs: here, or also in a folder of its own (package, with research.js) */
  folderOfItsOwn: boolean
}

const KEY = 'variable-machine.research'
const DEFAULTS: ResearchChoices = {
  take: 'list',
  trainFrom: 'all',
  folder: '',
  sources: ['scholarship'],
  writer: 'qwen3:4b',
  screener: 'qwen3:4b',
  summariser: 'qwen3:4b',
  ranker: 'nomic-embed-text',
  top: 40,
  second: false,
  secondScreener: 'qwen3:1.7b',
  summaries: false,
  fullText: false,
  fields: [],
  library: [],
  whose: 'mine',
  base: 'HuggingFaceTB/SmolLM2-360M-Instruct',
  folderOfItsOwn: false,
}

let choices: ResearchChoices = DEFAULTS
try {
  choices = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  // blocked storage: the defaults, for this visit
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

export const useResearchChoices = () => useSyncExternalStore(subscribe, () => choices)
/** The choices as they are now, outside React. */
export const researchChoices = () => choices

export function chooseResearch<K extends keyof ResearchChoices>(k: K, v: ResearchChoices[K]) {
  if (choices[k] === v) return
  choices = { ...choices, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(choices))
  } catch {
    // not remembered; still applies now
  }
  listeners.forEach((l) => l())
}

/** Add a field, a part of your library, or take it away; none is allowed. */
export function toggleIn<K extends 'fields' | 'library'>(k: K, v: ResearchChoices[K][number]) {
  const list = choices[k] as string[]
  chooseResearch(k, (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) as ResearchChoices[K])
}

/** Add a source to the ones searched, or take it away; one stays. */
export function toggleSource(s: Source) {
  const has = choices.sources.includes(s)
  if (has && choices.sources.length === 1) return
  chooseResearch('sources', has ? choices.sources.filter((x) => x !== s) : [...choices.sources, s])
}
