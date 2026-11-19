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
/** Where it searches. Scholarship and feeds are built; the rest are planned (see the shared notes' research-sources-check.md). */
export type Source = 'scholarship' | 'feeds' | 'patents' | 'archives' | 'newspapers' | 'europeana'
export const SOURCES: Source[] = ['scholarship', 'patents', 'archives', 'newspapers', 'europeana', 'feeds']
export const BUILT_SOURCES = new Set<Source>(['scholarship', 'feeds'])
/** The Ollama models a role can be played by; the ranker is nomic-embed-text, the only one papers screen takes. */
export const ROLE_MODELS = ['qwen3:4b', 'qwen3:1.7b']

export interface ResearchChoices {
  take: Take
  trainFrom: TrainFrom
  /** the research folder followed (workspace/research/<folder>); empty until a search makes one */
  folder: string
  sources: Source[]
  writer: string
  screener: string
  summariser: string
  /** how many of the closest items the screener reads (papers screen --top) */
  top: number
  summaries: boolean
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
  top: 40,
  summaries: false,
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

/** Add a source to the ones searched, or take it away; one stays. */
export function toggleSource(s: Source) {
  const has = choices.sources.includes(s)
  if (has && choices.sources.length === 1) return
  chooseResearch('sources', has ? choices.sources.filter((x) => x !== s) : [...choices.sources, s])
}
