import { useSyncExternalStore } from 'react'

/**
 * The decisions of the latent image, followed as a project: which pictures,
 * which texts frame it, which diffusion model draws it, in whose look, and
 * what is measured against it. Kept in this browser (localStorage), so a
 * reload keeps the route; what each decision made is in the workspace
 * (workspace/images, raw, latents and outputs).
 */

/** The pictures: the example (a made-up person's photo roll, drawn from prompts, to try the card first, as the dream reading has its demo deck), screenshots of a grid (a photo roll or Instagram's Saved grid), screenshots one picture each, or a public-domain body of work. */
export type Pictures = 'example' | 'grid' | 'single' | 'museum'
export const PICTURES: Pictures[] = ['example', 'grid', 'single', 'museum']
/** the example's screenshots: images/example-roll; its pictures, cropped: images/example-roll-pictures */
export const EXAMPLE_SET = 'example-roll'
/** The diffusion model that draws the latent image. Kandinsky 2.2 is built; TAESD, for an 8 GB Mac, is planned. */
export type Diffusion = 'kandinsky' | 'taesd'
export const DIFFUSIONS: Diffusion[] = ['kandinsky', 'taesd']
export const BUILT_DIFFUSIONS = new Set<Diffusion>(['kandinsky'])
/** Whose look the latent image is drawn in: the model's, learned from the web, or the set's own (the decoder trained on it). */
export type Look = 'web' | 'set'

/** The media-theory texts the tool can bring in: the open ones (Wikipedia articles on the works, and two public-domain texts). The works themselves are in copyright: read through the library. */
export const MEDIA_TEXTS = [
  { id: 'benjamin', name: 'benjamin-work-of-art', args: ['wikipedia', 'The_Work_of_Art_in_the_Age_of_Mechanical_Reproduction'] },
  { id: 'barthes', name: 'barthes-camera-lucida', args: ['wikipedia', 'Camera_Lucida_(book)'] },
  { id: 'baudrillard', name: 'baudrillard-simulacra', args: ['wikipedia', 'Simulacra_and_Simulation'] },
  { id: 'lacan', name: 'lacan-mirror-stage', args: ['wikipedia', 'Mirror_stage'] },
  { id: 'holmes', name: 'holmes-stereograph', args: ['gutenberg', '11751'] },
  { id: 'plato', name: 'plato-sophist', args: ['gutenberg', '1735'] },
] as const
export type MediaText = (typeof MEDIA_TEXTS)[number]['id']

export interface LatentChoices {
  pictures: Pictures
  /** the image set the screenshots go into (workspace/images/<set>); the crop goes into <set>-pictures */
  set: string
  /** the media-theory texts brought in */
  texts: MediaText[]
  /** your own writing, or PDFs, beside them (data raw file) */
  own: boolean
  diffusion: Diffusion
  look: Look
  /** the image set measured against the latent image: empty is the collection itself */
  against: string
}

const KEY = 'variable-machine.latent'
const DEFAULTS: LatentChoices = {
  pictures: 'example',
  set: 'screenshots',
  texts: MEDIA_TEXTS.map((t) => t.id),
  own: false,
  diffusion: 'kandinsky',
  look: 'set',
  against: '',
}

let choices: LatentChoices = DEFAULTS
try {
  choices = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  // blocked storage: the defaults, for this visit
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

export const useLatentChoices = () => useSyncExternalStore(subscribe, () => choices)
/** The choices as they are now, outside React. */
export const latentChoices = () => choices

export function chooseLatent<K extends keyof LatentChoices>(k: K, v: LatentChoices[K]) {
  if (choices[k] === v) return
  choices = { ...choices, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(choices))
  } catch {
    // not remembered; still applies now
  }
  listeners.forEach((l) => l())
}

/** Add a text, or take it away; none is allowed (the latent image doesn't need them: they frame it). */
export function toggleMediaText(t: MediaText) {
  chooseLatent('texts', choices.texts.includes(t) ? choices.texts.filter((x) => x !== t) : [...choices.texts, t])
}
