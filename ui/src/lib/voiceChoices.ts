import { useSyncExternalStore } from 'react'

/**
 * The decisions of a character's voice, followed as a project: each changes
 * the route through the tabs or what the student ends up with. Kept in this
 * browser (localStorage), so a reload keeps the route; what each decision
 * made is in the workspace.
 */
export type Approach = 'modelfile' | 'imitate' | 'prefer' | 'blend'
export const APPROACHES: Approach[] = ['modelfile', 'imitate', 'prefer', 'blend']

export interface VoiceChoices {
  /** how the model changes: by words, by imitating, by leaning toward chosen answers, or by blending two voices */
  approach: Approach
  /** the base: an Ollama model for a Modelfile; a Hugging Face id for training */
  modelfileBase: string
  trainBase: string
  /** the texts the rows are drafted from, as data draft takes them: raw/<name> or uploads/<file> */
  texts: string[]
  /** who writes the rows: a model drafts them for the student to read, or the student writes corrections */
  rows: 'draft' | 'corrections'
  /** where prefer starts: the base, or the voice trained by imitating */
  preferFrom: 'base' | 'voice'
}

const KEY = 'variable-machine.voice'
const DEFAULTS: VoiceChoices = { approach: 'modelfile', modelfileBase: 'smollm2:360m', trainBase: 'HuggingFaceTB/SmolLM2-360M-Instruct', texts: [], rows: 'draft', preferFrom: 'base' }

let choices: VoiceChoices = DEFAULTS
try {
  choices = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  // blocked storage: the defaults, for this visit
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

export const useVoiceChoices = () => useSyncExternalStore(subscribe, () => choices)

export function chooseVoice<K extends keyof VoiceChoices>(k: K, v: VoiceChoices[K]) {
  if (choices[k] === v) return
  choices = { ...choices, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(choices))
  } catch {
    // not remembered; still applies now
  }
  listeners.forEach((l) => l())
}

/** Add a text to the ones the rows come from, or take it away. */
export const toggleText = (t: string) => chooseVoice('texts', choices.texts.includes(t) ? choices.texts.filter((x) => x !== t) : [...choices.texts, t])
