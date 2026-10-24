import { Icon, type GlyphProps } from './Icon'

/** Panel marker: Move (scattered points: what the camera finds on a body). */
export function MoveMark(props: GlyphProps) {
  return <Icon name="scatter" {...props} />
}
