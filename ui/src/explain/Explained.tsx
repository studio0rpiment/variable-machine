import { cloneElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { EXPLAIN, type ExplainId } from './text'

interface Props {
  id: ExplainId
  /** the one element being explained; it gets aria-describedby, so a screen reader reads the explanation too */
  children: ReactElement<{ 'aria-describedby'?: string }>
  /**
   * The element is inside an SVG (a node on the Start map): the wrapper is a
   * <g> instead of a <span>, and it is the module itself, so the flag hangs
   * off the node rather than covering it.
   */
  svg?: boolean
  /**
   * A different element to treat as the module (a selector). The Start map
   * gives its whole canvas, so a node's flag goes out toward the map's nearest
   * edge, beside the node; such a flag may also cover the top bar.
   */
  module?: string
}

type Side = 'below' | 'above' | 'right' | 'left'
type Edge = 'start' | 'end'
interface Placement {
  side: Side
  edge: Edge
  style: CSSProperties
}

/**
 * A module is a group of controls that belong together: the Train column with
 * type, rank, layers and learning rate; a card; a step. A flag should not
 * cover its own module's other controls, so it attaches to its control at the
 * edge nearest the module's border and hangs out past that border. Anything
 * can be marked a module with data-module; these are the groups the app has.
 */
const MODULE = [
  '[data-module]',
  '.train-form__col',
  '.merge-form > *',
  '.mf-form__row',
  '.mf-field',
  '.mf-check',
  '.mf-make__run',
  '.manifest',
  '.mf-chosen',
  '.mf-part',
  '.data-way',
  '.split',
  '.prefs__rule',
  '.nav-group--ways',
  '.shell__nav',
].join(', ')

/**
 * The tail: a plain triangle, low and wide, its point set off-centre so it
 * looks as if the flag is being pulled toward its element a little. Drawn on
 * the two sides that leave the flag; the open side overlaps the flag's border
 * and covers it, so tail and flag read as one outline.
 */
const TAIL: Record<Side, { box: string; d: string }> = {
  below: { box: '0 0 18 8', d: 'M0 8.5 L6 0 L18 8.5' },
  above: { box: '0 0 18 8', d: 'M0 -0.5 L6 8 L18 -0.5' },
  right: { box: '0 0 8 18', d: 'M8.5 0 L0 6 L8.5 18' },
  left: { box: '0 0 8 18', d: 'M-0.5 0 L8 6 L-0.5 18' },
}

const FLAG_W = 24 * 16 // .flag max-width, 24rem
const MIN_W = 14 * 16 // narrowest a flag beside its element may be
const FLAG_H = 13 * 16 // a typical flag's height; long ones are clamped to the screen
const TOP = 72 // below the app's top bar

/**
 * Where the flag goes, decided when it opens: on the side of the element that
 * is nearest the border of its module and has room on the screen, so most of
 * the flag lies outside the module. Without a module, below the element (or
 * above it when it is low on the screen), as before.
 */
/**
 * How wide a flag must be to fit in a given height, for a text of n
 * characters (an estimate from the flag's monospace size), or null if even
 * the widest flag won't fit. Lets a flag above the Start map go wide and
 * short instead of falling back over the map.
 */
function widthToFit(chars: number, height: number, maxW: number): number | null {
  const CHAR = 7.6 // px per character at the flag's 0.78rem monospace
  const LINE = 19.4 // px per line (line-height 1.55)
  const CHROME = 72 // title, padding and tail
  const lines = Math.floor((height - CHROME) / LINE)
  if (lines < 1) return null
  const w = Math.ceil((chars * CHAR) / lines) + 40
  return w <= maxW ? Math.max(w, FLAG_W) : null
}

function place(el: Element, given?: Element | null, chars = 300): { at: Placement; module: Element | null } {
  // a flag sent out of a given module may cover the top bar; others stay below it
  const top = given ? 8 : TOP
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(FLAG_W, vw - 16)
  const module = given ?? el.parentElement?.closest(MODULE) ?? null
  const m = module?.getBoundingClientRect() ?? r
  const room: Record<Side, boolean> = {
    below: vh - r.bottom >= FLAG_H * 0.8,
    // sent out of the map, a flag above may widen to fit the room there
    above: given ? widthToFit(chars, r.top - top, vw - 16) !== null : r.top - top >= FLAG_H * 0.8,
    // Beside it, a flag may be narrower than usual (down to MIN_W) rather than fall back over the module.
    right: vw - r.right >= MIN_W + 8,
    left: r.left >= MIN_W + 8,
  }
  // Nearest border first; ties go below, then above, right, left.
  const order: Side[] = ['below', 'above', 'right', 'left']
  const gap: Record<Side, number> = { below: m.bottom - r.bottom, above: r.top - m.top, right: m.right - r.right, left: r.left - m.left }
  const side = [...order].sort((a, b) => gap[a] - gap[b] || order.indexOf(a) - order.indexOf(b)).find((s) => room[s]) ?? (r.bottom < vh * 0.55 ? 'below' : 'above')

  if (side === 'right' || side === 'left') {
    // Beside the element, its tail level with the element's middle.
    const y = Math.max(top, Math.min(r.top + r.height / 2 - 28, vh - FLAG_H - 8))
    const tailY = Math.max(10, Math.min(r.top + r.height / 2 - y - 5, FLAG_H - 24))
    return {
      module,
      at: {
        side,
        edge: 'start',
        style: {
          top: y,
          ...(side === 'right' ? { left: r.right } : { right: vw - r.left }),
          maxWidth: Math.min(w, (side === 'right' ? vw - r.right : r.left) - 8),
          ['--tail-y' as string]: `${tailY}px`,
        },
      },
    }
  }
  const wide = given && side === 'above' ? widthToFit(chars, r.top - top, vw - 16) : null
  const fw = wide ?? w
  const edge: Edge = r.left + fw <= vw - 8 || r.left + r.width / 2 < vw / 2 ? 'start' : 'end'
  const left = Math.max(8, Math.min(r.left - 8, vw - fw - 8))
  // a flag pushed left to stay on screen keeps its tail over the element
  const tailX = Math.max(12, Math.min(r.left + Math.min(r.width / 2, 24) - left - 9, fw - 30))
  return {
    module,
    at: {
      side,
      edge,
      style: {
        ...(side === 'below' ? { top: r.bottom } : { bottom: vh - r.top }),
        ...(edge === 'start' ? { left, ['--tail-x' as string]: `${tailX}px` } : { right: Math.max(8, vw - r.right - 8) }),
        ...(wide && { maxWidth: wide, width: wide }),
      },
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
export function Explained({ id, children, svg, module: moduleSel }: Props) {
  const tipId = useId()
  const wrap = useRef<HTMLSpanElement & SVGGElement>(null)
  const flag = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<Placement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const e = EXPLAIN[id]

  const module = useRef<Element | null>(null)
  const open = () => {
    const el = wrap.current?.firstElementChild
    if (!el || dismissed) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return // nothing to point at if it isn't laid out (a hidden panel)
    const p = place(el, moduleSel ? document.querySelector(moduleSel) : undefined, e.title.length + e.text.length)
    module.current = p.module
    setAt(p.at)
  }
  const close = () => setAt(null)
  const within = (n: EventTarget | null, ref: { current: Element | null }) => n instanceof Node && !!ref.current?.contains(n)

  // While open, close it on anything that would leave it pointing at the wrong place or at nothing:
  // a scroll or resize; a panel change (the element may be hidden with the pointer still over where
  // it was, so no pointerleave ever comes); or the pointer arriving somewhere else entirely.
  // While a flag is open, its module shows its border: the group this control belongs to.
  useEffect(() => {
    const m = at && !moduleSel ? module.current : null
    m?.classList.add('is-explained')
    return () => m?.classList.remove('is-explained')
  }, [at])

  useEffect(() => {
    if (!at) return
    const elsewhere = (ev: PointerEvent) => {
      if (!within(ev.target, wrap) && !within(ev.target, flag)) close()
    }
    window.addEventListener('scroll', close, true)
    // a press or a wheel can move what it points at (dragging or zooming the Start map), so it goes too
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('wheel', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    window.addEventListener('hashchange', close)
    document.addEventListener('pointerover', elsewhere)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('wheel', close, { capture: true })
      window.removeEventListener('resize', close)
      window.removeEventListener('hashchange', close)
      document.removeEventListener('pointerover', elsewhere)
    }
  }, [at])

  const handlers = {
    onPointerEnter: open,
    onPointerLeave: (ev: React.PointerEvent) => {
      if (within(ev.relatedTarget, flag)) return
      if (!wrap.current?.contains(document.activeElement)) close()
      setDismissed(false)
    },
    onFocus: open,
    onBlur: (ev: React.FocusEvent) => {
      if (within(ev.relatedTarget, wrap)) return
      close()
      setDismissed(false)
    },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === 'Escape' && at) {
        close()
        setDismissed(true)
      }
    },
  }
  // What a screen reader reads; the visible flag repeats it for the eye. (Inside an SVG a <span> can't sit, so it goes to the body.)
  const described = (
    <span id={tipId} hidden>
      {e.title}. {e.text}
    </span>
  )
  const inner = (
    <>
      {cloneElement(children, { 'aria-describedby': tipId })}
      {svg ? createPortal(described, document.body) : described}
      {at &&
        createPortal(
          <span
            ref={flag}
            className={`flag flag--${at.side} flag--${at.edge}`}
            style={at.style}
            aria-hidden="true"
            onPointerLeave={(ev) => !within(ev.relatedTarget, wrap) && close()}
          >
            <svg className="flag__tail" viewBox={TAIL[at.side].box} aria-hidden="true">
              <path d={TAIL[at.side].d} />
            </svg>
            <span className="flag__body">
              <span className="flag__title">{e.title}</span>
              <span className="flag__text">{e.text}</span>
            </span>
          </span>,
          document.body,
        )}
    </>
  )
  return svg ? (
    <g ref={wrap} {...(moduleSel ? {} : { 'data-module': '' })} {...handlers}>
      {inner}
    </g>
  ) : (
    <span ref={wrap} className="explained" {...handlers}>
      {inner}
    </span>
  )
}