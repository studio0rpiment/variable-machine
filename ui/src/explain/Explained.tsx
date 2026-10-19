import { cloneElement, useId, useState, type ReactElement } from 'react'
import { EXPLAIN, type ExplainId } from './text'

export type FlagPlace = 'below' | 'below-end'

interface Props {
  id: ExplainId
  /** the one element being explained; it gets aria-describedby so a screen reader reads the flag too */
  children: ReactElement<{ 'aria-describedby'?: string }>
}

/**
 * The explanation layer: a flag that points at an element and says, in plain
 * language, what it is for. It appears as a tooltip on hover or keyboard
 * focus, after a short CSS delay so sweeping the mouse across a row of tabs
 * doesn't flash every flag. Esc puts it away until the pointer or focus
 * leaves (WCAG 1.4.13). The flag is inside the wrapper, so moving the pointer
 * onto it to read a long paragraph keeps it open.
 *
 * Which way it hangs is decided when it opens (pointer enter or focus), from
 * where the element is on screen: from its left edge in the left half, from
 * its right edge in the right half. Rows that wrap at narrow widths still get
 * a flag that stays on screen.
 *
 * Same idea as the decides app's onboarding flags (a skewed bubble whose tail
 * points at the control), drawn in KP Minimal: an outline, not a fill.
 */
export function Explained({ id, children }: Props) {
  const tipId = useId()
  const [dismissed, setDismissed] = useState(false)
  const [place, setPlace] = useState<FlagPlace>('below')
  const e = EXPLAIN[id]
  const choose = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setPlace(r.left + r.width / 2 > window.innerWidth / 2 ? 'below-end' : 'below')
  }
  return (
    <span
      className={`explained ${dismissed ? 'is-dismissed' : ''}`.trim()}
      onKeyDown={(ev) => ev.key === 'Escape' && setDismissed(true)}
      onPointerEnter={(ev) => choose(ev.currentTarget)}
      onFocus={(ev) => choose(ev.currentTarget)}
      onPointerLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {cloneElement(children, { 'aria-describedby': tipId })}
      <span id={tipId} role="tooltip" className={`flag flag--${place}`}>
        <span className="flag__tail" aria-hidden="true" />
        <span className="flag__body">
          <span className="flag__title">{e.title}</span>
          <span className="flag__text">{e.text}</span>
        </span>
      </span>
    </span>
  )
}
