import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'

/** Each card keeps one name as it moves between the grid, the left and the rail, so the browser can glide it there. */
export const glide = (kind: string, id: string): CSSProperties => ({ viewTransitionName: `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}` })

/** Change the layout with the cards gliding to their new places, where the browser can and the student hasn't asked for less motion. */
export function moving(change: () => void) {
  type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> }
  const d = document as Document & { startViewTransition?: (cb: () => void) => Transition }
  if (!d.startViewTransition || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return change()
  // The browser can skip or abort a transition (a page still settling, a background tab); the change must happen anyway.
  let ran = false
  const t = d.startViewTransition(() => {
    ran = true
    flushSync(change)
  })
  const ensure = () => !ran && ((ran = true), change())
  t.ready.catch(ensure)
  t.updateCallbackDone.catch(ensure)
  t.finished.catch(ensure)
}
