import { useSyncExternalStore } from 'react'

/**
 * View preferences kept per viewer, in this browser: whether the
 * explanation flags open, and how tall the terminal is (short or tall, or a
 * height in rem dragged with the line along its top). Remembered in
 * localStorage when the browser allows; if it doesn't, they reset on reload.
 */
type Prefs = { flags: boolean; tallTerminal: boolean; terminalRem: number | null }
const KEY = 'variable-machine.view'

let prefs: Prefs = { flags: true, tallTerminal: false, terminalRem: null }
try {
  prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
} catch {
  // private window or blocked storage: the defaults
}
const listeners = new Set<() => void>()

function apply() {
  document.documentElement.dataset.terminal = prefs.tallTerminal ? 'tall' : 'short'
  document.documentElement.dataset.flags = prefs.flags ? 'on' : 'off'
  if (prefs.terminalRem) document.documentElement.style.setProperty('--terminal-height', `${prefs.terminalRem}rem`)
  else document.documentElement.style.removeProperty('--terminal-height')
}
apply()

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // not remembered; still applies now
  }
  apply()
  listeners.forEach((l) => l())
}

/** Read without subscribing (for event handlers, like a flag deciding whether to open). */
export const getPref = <K extends keyof Prefs>(k: K) => prefs[k]

export function usePref<K extends keyof Prefs>(k: K): Prefs[K] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => prefs[k],
  )
}
