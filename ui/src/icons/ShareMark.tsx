import { Icon, type GlyphProps } from './Icon'

/** Panel marker: Share (a bolt turned outward: send it on). */
export function ShareMark(props: GlyphProps) {
  return <Icon name="bolt" direction="r90" {...props} />
}
