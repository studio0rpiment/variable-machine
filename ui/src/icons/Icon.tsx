import type { CSSProperties } from 'react'
import sprite from './hand-icons.svg?url'
import type { IconDirection, IconName, IconVariant } from './names'
import './hand-icons.css'

export interface IconProps {
  name: IconName
  variant?: IconVariant
  direction?: IconDirection
  /** rem; the glyph is 1em square. */
  size?: number
  /** accessible label; omit for decorative icons */
  label?: string
  className?: string
  style?: CSSProperties
}

/**
 * The shared wrapper for Kevin's hand-icons (CC BY 4.0, copied from
 * ~/__DEV/hand-icons-repo). Size in rem; colour is currentColor, so icons take
 * the line colour (or --muted from a parent at rest).
 * Defaults to the fill variant: at rem sizes the line variant is a hairline
 * outline of the ink, while fill is the ink stroke itself.
 *
 * The app uses only the set's seven solid shapes (blob, bolt, dumbbell,
 * star-scribble, triangle-a, triangle-b, triangle-y), with rotations telling
 * repeats apart. Each glyph file in this folder says which shape and turn it
 * uses, so swapping one is a one-line change. Filled, the three triangles
 * all read as plain solid triangles, so in the tab row they differ by
 * direction: start ▲, modelfile ▼, train ▶, adapters ◀.
 */
export function Icon({ name, variant = 'fill', direction = 'base', size = 1.25, label, className, style }: IconProps) {
  const id = `hi-${name}-${variant}${direction === 'base' ? '' : `-${direction}`}`
  return (
    <svg
      className={['hi', className].filter(Boolean).join(' ')}
      style={{ fontSize: `${size}rem`, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <use href={`${sprite}#${id}`} />
    </svg>
  )
}

export type GlyphProps = Omit<IconProps, 'name' | 'direction'>
