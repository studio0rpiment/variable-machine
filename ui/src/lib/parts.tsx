import { createContext, useContext, type ReactNode } from 'react'

/**
 * Project mode: the parts of a tab the open step uses. A tab wraps a section
 * in <Part id="data.drafts">; while a project is followed, a marked part shows
 * only if the step lists it, and anything unmarked always shows. Outside
 * project mode (null) every part shows. A hidden part stays mounted, so what
 * was typed in it is still there when a later step shows it.
 */
const Parts = createContext<string[] | null>(null)

export const PartsProvider = Parts.Provider

export function Part({ id, children }: { id: string; children: ReactNode }) {
  const show = useContext(Parts)
  return (
    <div className="part" data-part={id} hidden={!!show && !show.includes(id)}>
      {children}
    </div>
  )
}
