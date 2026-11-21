import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

/**
 * Project mode: the parts of a tab the open step uses. A tab wraps a section
 * in <Part id="data.drafts">; while a project is followed, a marked part shows
 * only if the step lists it, and anything unmarked always shows. Outside
 * project mode (null) every part shows. A hidden part stays mounted, so what
 * was typed in it is still there when a later step shows it. The parts shown
 * follow the step's order, not the tab's: each carries its place in the list as
 * --part-order, which its children take as their flex order.
 */
const Parts = createContext<string[] | null>(null)

export const PartsProvider = Parts.Provider
/** A step that uses its whole tab. */
export const ALL_PARTS = ['*']
/** True inside project mode, where a tab sits in a page and should not scroll that page by itself. */
export const useInProject = () => useContext(Parts) !== null

export function Part({ id, children }: { id: string; children: ReactNode }) {
  const show = useContext(Parts)
  const at = show ? show.indexOf(id) : -1
  const style = at >= 0 ? ({ '--part-order': at + 1 } as CSSProperties) : undefined
  return (
    <div className="part" data-part={id} hidden={!!show && !show.includes('*') && at < 0} style={style}>
      {children}
    </div>
  )
}
