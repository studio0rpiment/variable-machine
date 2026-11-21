import { useSyncExternalStore } from 'react'
import type { Tracker } from '@shared/gesture'

/**
 * The gesture tab's choices, kept in one place so the tab and the gesture
 * controller's schematic share them: the set in use, what a new set follows,
 * and where examples are recorded from. In the page only; what a set follows,
 * once it is made, is in its manifest.
 */
export interface GestureChoices {
  /** the set in use; '' while a new set is being made */
  set: string
  /** what a new set follows */
  tracker: Tracker
  /** where examples are recorded from */
  source: 'camera' | 'photo'
}

let choices: GestureChoices = { set: '', tracker: 'hands', source: 'camera' }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

export const useGestureChoices = () => useSyncExternalStore(subscribe, () => choices)

/** Change one choice, as a value or from the one before (like a state setter). */
export function choose<K extends keyof GestureChoices>(k: K, v: GestureChoices[K] | ((was: GestureChoices[K]) => GestureChoices[K])) {
  const next = typeof v === 'function' ? (v as (was: GestureChoices[K]) => GestureChoices[K])(choices[k]) : v
  if (next === choices[k]) return
  choices = { ...choices, [k]: next }
  listeners.forEach((l) => l())
}
