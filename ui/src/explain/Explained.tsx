import { cloneElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { EXPLAIN, type ExplainId } from './text'

interface Props {
  id: ExplainId
  /** the one element being explained; it gets aria-describedby, so a screen reader reads the explanation too */
  children: ReactElement<{ 'aria-describedby'?: string }>
}

type Side = 'below' | 'above'
type Edge = 'start' | 'end'
interface Placement {
  side: Side
  edge: Edge
  style: CSSProperties
}

/**
 * Where the flag goes, decided when it opens: below the element, or above it
 * when the element is low on the screen (the terminal is down there); hanging
 * from its left edge, or from its right edge when it sits in the right half.
 */
function place(r: DOMRect): Placement {
  const side: Side = r.bottom < window.innerHeight * 0.55 ? 'below' : 'above'
  const edge: Edge = r.left + r.width / 2 < window.innerWidth / 2 ? 'start' : 'end'
  return {
    side,
    edge,
    style: {
      ...(side === 'below' ? { top: r.bottom } : { bottom: window.innerHeight - r.top }),
      ...(edge === 'start' ? { left: Math.max(8, r.left - 8) } : { right: Math.max(8, window.innerWidth - r.right - 8) }),
    },
  }
}

/**
 * The explanation layer: a flag that points at an element and says, in plain
 * language, what it is for. Same idea as the decides app's onboarding flags (a
 * slanted bubble whose tail points at the control), drawn in KP Minimal as an
 * outline rather than a fill.
 *
 * It opens on hover or keyboard focus. It's drawn in a layer above the page
 * (a portal), so panels that scroll can't clip it, and it fades in after a
 * short CSS delay, so sweeping the mouse across a row of controls doesn't
 * flash every flag. Moving the pointer from the element onto the flag keeps it
 * open, Esc puts it away, and scrolling closes it (it would no longer line up).
 *
 * The wrapper is display: contents, so wrapping a control never changes its
 * layout; the element measured is the wrapper's first child.
 */
export function Explained({ id, children }: Props) {
  const tipId = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const flag = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<Placement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const e = EXPLAIN[id]

  const open = () => {
    const el = wrap.current?.firstElementChild
    if (!el || dismissed) return
    const r = el.getBoundingClientRect()
    if (r.width && r.height) setAt(place(r)) // nothing to point at if it isn't laid out (a hidden panel)
  }
  const close = () => setAt(null)
  const within = (n: EventTarget | null, ref: { current: HTMLElement | null }) => n instanceof Node && !!ref.current?.contains(n)

  // While open, close it on anything that would leave it pointing at the wrong place or at nothing:
  // a scroll or resize; a panel change (the element may be hidden with the pointer still over where
  // it was, so no pointerleave ever comes); or the pointer arriving somewhere else entirely.
  useEffect(() => {
    if (!at) return
    const elsewhere = (ev: PointerEvent) => {
      if (!within(ev.target, wrap) && !within(ev.target, flag)) close()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('hashchange', close)
    document.addEventListener('pointerover', elsewhere)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('hashchange', close)
      document.removeEventListener('pointerover', elsewhere)
    }
  }, [at])

  return (
    <span
      ref={wrap}
      className="explained"
      onPointerEnter={open}
      onPointerLeave={(ev) => {
        if (within(ev.relatedTarget, flag)) return
        if (!wrap.current?.contains(document.activeElement)) close()
        setDismissed(false)
      }}
      onFocus={open}
      onBlur={(ev) => {
        if (within(ev.relatedTarget, wrap)) return
        close()
        setDismissed(false)
      }}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && at) {
          close()
          setDismissed(true)
        }
      }}
    >
      {cloneElement(children, { 'aria-describedby': tipId })}
      {/* What a screen reader reads; the visible flag below repeats it for the eye. */}
      <span id={tipId} hidden>
        {e.title}. {e.text}
      </span>
      {at &&
        createPortal(
          <span
            ref={flag}
            className={`flag flag--${at.side} flag--${at.edge}`}
            style={at.style}
            aria-hidden="true"
            onPointerLeave={(ev) => !within(ev.relatedTarget, wrap) && close()}
          >
            <span className="flag__tail" />
            <span className="flag__body">
              <span className="flag__title">{e.title}</span>
              <span className="flag__text">{e.text}</span>
            </span>
          </span>,
          document.body,
        )}
    </span>
  )
}
