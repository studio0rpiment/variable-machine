/**
 * How a schematic fills the page's width: Make Your Own's map, and every
 * project's map (voice, research bot, latent image, dream reading). They are
 * all drawn in the Start map's units, on its columns.
 *
 * Up to MAX_PX the map scales to fit the page. Wider, it keeps that scale: the
 * boxes stay their size and the extra width goes into the gaps between the
 * columns, so the wires across a gap get longer. The folded strip is a window
 * onto the same wider map.
 */

type P = [number, number]

/** Up to this width, in px, a map scales to fit; wider, it keeps this scale and the wires between its columns get longer. */
export const MAX_PX = 60 * 16

/** The gaps between the Start map's columns, in its units, where extra width goes. The boxes, and the ports and outlines at their edges, stay as they are. */
const GAPS: P[] = [[215, 295], [455, 570], [752, 815], [975, 985]]

export const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How many units wider than drawn a map `drawnW` units wide is at `px`: none up to MAX_PX, then whatever keeps the boxes at their size. */
export const extraFor = (drawnW: number, px: number) => Math.max(0, (drawnW * px) / MAX_PX - drawnW)

/** x on the map as drawn, to x on a map `extra` units wider, shared equally among the gaps. */
export function stretcher(extra: number) {
  if (extra <= 0) return (x: number) => x
  const share = extra / GAPS.length
  return (x: number) => GAPS.reduce((at, [a, b]) => at + share * within((x - a) / (b - a), 0, 1), x)
}

/**
 * How wide the folded strip's window is, in the map's units: `base` on a
 * laptop; closer in on a narrow screen (down to `min`), so its boxes stay
 * readable; on a wider screen as wide as the screen at the laptop's scale.
 */
export const stripZoom = (px: number, base: number, min: number) => (px > MAX_PX ? (base * px) / MAX_PX : within(px * 1.6, min, base))

/**
 * A map at a page `px` wide: how much wider than drawn it is, its width in its
 * own units, the strip's window, and `sx`, which moves an x as drawn to where
 * it is on the wider map. Every x a schematic draws goes through `sx`.
 */
export function mapWidth(px: number, drawnW: number, strip: { base: number; min: number }) {
  const extra = extraFor(drawnW, px)
  return { extra, w: drawnW + extra, zoom: stripZoom(px, strip.base, strip.min), sx: stretcher(extra) }
}
