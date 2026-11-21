import { useEffect, useRef, type ReactNode } from 'react'
import FlowMap, { H, NODES, W } from './FlowMap'
import { MAX_PX, mapWidth, stripZoom, within } from '../lib/mapWidth'
import { useGlide } from './VoiceMode'
import { useRoutePage } from '../lib/routePage'
import { say } from '../text/say'

/**
 * Make Your Own: all of Variable Machine on one long page, in the Start map's
 * order, with the Start map as the way round it. The page opens on the whole
 * map. As it scrolls, each px scrolled takes a px off the map's height, and the
 * view closes in on the box of the part in view, until the map is a strip at
 * the top: a window onto the same map, at the same place, never redrawn. The
 * box of the part in view is lit; the strip glides to it. FULL, in the top bar,
 * opens the whole map again over the page; a click on a box goes to its part.
 */

/** The page's parts, in the Start map's order: one for each tab, each under its box. */
export const PARTS = ['models', 'modelfile', 'data', 'train', 'prefer', 'merge', 'adapters', 'chat', 'share', 'segmentation', 'speech', 'gesture'] as const
export type Part = (typeof PARTS)[number]
export const isPart = (id: string): id is Part => (PARTS as readonly string[]).includes(id)

/** The whole map, in its own units: every row, down to the gesture row (the projects row isn't drawn here: Projects is in the top bar). */
const DRAWN = { x: 30, y: 16, w: 1170, h: 750 }
/** The folded strip: how much of the map it shows, in the map's units. */
const STRIP = 104
/** The strip's window on a laptop, in the map's units, and how close in it goes on a narrow screen. */
const STRIP_ZOOM = { base: 900, min: 520 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const noStep = () => {}

export default function MakeYourOwn({ whole, onZoom, onFocus, children }: { whole: boolean; onZoom: () => void; onFocus: (part: string | null) => void; children?: ReactNode }) {
  const pxRef = useRef(MAX_PX)
  const { space, self, scroll, focus, width, pick } = useRoutePage({ step: 1, project: 'make', onStep: noStep, stripPx: () => (STRIP * pxRef.current) / stripZoom(pxRef.current, STRIP_ZOOM.base, STRIP_ZOOM.min), line: 'myo__line' })
  const px = width || MAX_PX
  const { extra, w, zoom: ZOOM, sx } = mapWidth(px, DRAWN.w, STRIP_ZOOM)
  const VIEW = { ...DRAWN, w }
  useEffect(() => onFocus(focus), [focus, onFocus])

  // the address names the part to go to (#data); a link elsewhere on the page that sets it lands there too
  const pickRef = useRef(pick)
  pickRef.current = pick
  useEffect(() => {
    // a moment later, so a page that was hidden (Projects, before the hash changed) is shown and measured first
    const go = () =>
      setTimeout(() => {
        const h = location.hash.slice(1)
        if (isPart(h)) pickRef.current(h)
      }, 60)
    addEventListener('hashchange', go)
    // once the page's parts are there
    const id = setTimeout(go, 400)
    return () => {
      removeEventListener('hashchange', go)
      clearTimeout(id)
    }
  }, [])

  // the strip closes in on the box of the part in view, or on models at the top of the page
  const node = NODES.find((n) => n.id === (focus ?? 'models'))!
  const zx = useGlide(within(sx(node.x) + W / 2 - ZOOM / 2, VIEW.x, VIEW.x + VIEW.w - ZOOM))
  // the box and its caption, a little below the middle so the wires over it show
  const zy = useGlide(within(node.y + H / 2 + 6 - STRIP / 2, VIEW.y, VIEW.y + VIEW.h - STRIP))
  // FULL: the whole map, open over the page
  const k = useGlide(whole ? 1 : 0)
  pxRef.current = px
  const open = (VIEW.h * px) / VIEW.w
  // each px scrolled takes a px off the map's height: solve for how far folded that is, as the view narrows and its height shrinks
  const want = Math.max((STRIP * px) / ZOOM, open - scroll)
  const t = clamp((want * VIEW.w - px * VIEW.h) / (px * (STRIP - VIEW.h) - want * (ZOOM - VIEW.w))) * (1 - k)
  const view = { x: lerp(VIEW.x, zx, t), y: lerp(VIEW.y, zy, t), w: lerp(VIEW.w, ZOOM, t), h: lerp(VIEW.h, STRIP, t) }

  const onPick = (to: string) => {
    // with the whole map open (FULL), a click on a box closes it back to the strip, zoomed in on that box
    if (whole) onZoom()
    if (!isPart(to)) return void (location.hash = to) // the projects row: the Projects mode
    history.replaceState(null, '', `${location.pathname}${location.search}#${to}`)
    pick(to)
  }

  return (
    <>
      {/* a direct child of the scrolling page, so it stays at the top as the rest scrolls */}
      <div className="myo__line">
        <div ref={self} className={`myo__frame ${t > 0.98 ? 'is-folded' : ''} ${k > 0 ? 'is-whole' : ''}`.replace(/\s+/g, ' ').trim()} aria-label={say('shared.make.map')} role="navigation">
          <FlowMap view={view} extra={extra} light={focus} onPick={onPick} />
          {/* under the strip, so it stays in sight: the guide bar, when a project's step is followed here */}
          {children}
        </div>
      </div>
      {/* holds the open map's place in the page; the map draws over it */}
      <div ref={space} className="myo" style={{ height: `${open / 16}rem` }} />
    </>
  )
}
