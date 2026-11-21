import { useSyncExternalStore } from 'react'

/**
 * Project mode: the project and step a student is following, from a card on
 * the Projects tab. It lives in the address (?project=studio&step=2&note=1),
 * so a reload or a shared link keeps it; the tab stays in the hash, as before.
 * step counts every step on the card from 1; note is the walkthrough's place
 * in that step (0 is the first note). mode=project is project mode: the
 * project's schematic in place of the tabs, for a card that has one.
 */
export interface Guide {
  project: string
  step: number
  note: number
  /** project mode: only the project's schematic and the parts of its tab the open step uses */
  mode: boolean
}

/** The cards with a schematic, so project mode can open on them: the gesture controller first. */
export const SCHEMATICS = new Set(['gesture', 'voice', 'research', 'latent', 'dream', 'dream-trained'])

const EVENT = 'variable-machine:guide'

function read(): Guide | null {
  const q = new URLSearchParams(location.search)
  const project = q.get('project')
  const step = Number(q.get('step'))
  if (!project || !Number.isInteger(step) || step < 1) return null
  return { project, step, note: Math.max(0, Number(q.get('note')) || 0), mode: q.get('mode') === 'project' && SCHEMATICS.has(project) }
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
  const q = g ? `?project=${encodeURIComponent(g.project)}&step=${g.step}${g.note ? `&note=${g.note}` : ''}${g.mode ? '&mode=project' : ''}` : ''
  const url = `${location.pathname}${q}${tab ? `#${tab}` : location.hash}`
  history[push ? 'pushState' : 'replaceState'](null, '', url)
  dispatchEvent(new Event(EVENT))
  // the shell follows the hash; pushState doesn't announce a new one by itself
  if (tab) dispatchEvent(new HashChangeEvent('hashchange'))
}

/** The address a card's step links to, for opening it in a new window. */
export const guideHref = (project: string, step: number, tab: string, mode = false) => `?project=${encodeURIComponent(project)}&step=${step}${mode ? '&mode=project' : ''}#${tab}`

/** Follow a project from this step: open its tab, first note; in project mode when asked, and the card has a schematic. */
export const startGuide = (project: string, step: number, tab: string, mode = false) => setAddress({ project, step, note: 0, mode: mode && SCHEMATICS.has(project) }, tab, true)
/** Leave project mode for all of Variable Machine: the tabs come back, and the guide bar keeps the step. */
export const leaveMode = () => current && setAddress({ ...current, mode: false }, null, true)
/** Leave project mode for the Projects page, its boxes. The project's box opens it again at its first step not done. */
export const toProjects = () => setAddress(null, 'projects', true)
/** Move to another note of the step; the tab stays. */
export const setNote = (note: number) => current && setAddress({ ...current, note }, null, false)
/** Stop following the project: the bar goes, the tab stays. */
export const closeGuide = () => setAddress(null, null, false)
