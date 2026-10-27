import { useEffect, useRef } from 'react'

/** Typing in these is typing: a space there is a space, not a record button. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * The space bar as a record button, anywhere on the page while `on`: down
 * (once, not the key's repeats) and up, the same as pressing and letting go of
 * the mouse. Not while typing in a field, nor with cmd, ctrl or alt held.
 */
export function useSpaceKey(on: boolean, down: () => void, up?: () => void) {
  // the latest handlers, so the listeners don't need adding again on every render
  const handlers = useRef({ down, up })
  handlers.current = { down, up }
  useEffect(() => {
    if (!on) return
    let held = false
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      // also stops a focused button from clicking, and the page from scrolling
      e.preventDefault()
      if (e.repeat || held) return
      held = true
      handlers.current.down()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !held) return
      e.preventDefault()
      held = false
      handlers.current.up?.()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      // leaving (another tab, the camera off) counts as letting go
      if (held) handlers.current.up?.()
    }
  }, [on])
}
