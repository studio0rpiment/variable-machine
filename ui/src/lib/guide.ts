import { useSyncExternalStore } from 'react'

/**
 * Project mode: the project and step a student is following, from a card on
 * the Projects tab. It lives in the address (?project=studio&step=2&note=1),
 * so a reload or a shared link keeps it; the tab stays in the hash, as before.
 * step counts every step on the card from 1; note is the walkthrough's place
 * in that step (0 is the first note).
 */
export interface Guide {
  project: string
  step: number
  note: number
}

const EVENT = 'variable-machine:guide'

function read(): Guide | null {
  const q = new URLSearchParams(location.search)
  const project = q.get('project')
  const step = Number(q.get('step'))
  if (!project || !Number.isInteger(step) || step < 1) return null
  return { project, step, note: Math.max(0, Number(q.get('note')) || 0) }
}

let current = read()
const listeners = new Set<() => void>()
const changed = () => {
  current = read()
  listeners.forEach((l) => l())
}
addEventListener('popstate', changed)
addEventListener(EVENT, changed)

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))
export const useGuide = () => useSyncExternalStore(subscribe, () => current)

function setAddress(g: Guide | null, tab: string | null, push: boolean) {
  const q = g ? `?project=${encodeURIComponent(g.project)}&step=${g.step}${g.note ? `&note=${g.note}` : ''}` : ''
  const url = `${location.pathname}${q}${tab ? `#${tab}` : location.hash}`
  history[push ? 'pushState' : 'replaceState'](null, '', url)
  dispatchEvent(new Event(EVENT))
  // the shell follows the hash; pushState doesn't announce a new one by itself
  if (tab) dispatchEvent(new HashChangeEvent('hashchange'))
}

/** The address a card's step links to, for opening it in a new window. */
export const guideHref = (project: string, step: number, tab: string) => `?project=${encodeURIComponent(project)}&step=${step}#${tab}`

/** Follow a project from this step: open its tab, first note. */
export const startGuide = (project: string, step: number, tab: string) => setAddress({ project, step, note: 0 }, tab, true)
/** Move to another note of the step; the tab stays. */
export const setNote = (note: number) => current && setAddress({ ...current, note }, null, false)
/** Stop following the project: the bar goes, the tab stays. */
export const closeGuide = () => setAddress(null, null, false)
