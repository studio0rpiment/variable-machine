import { Icon, type GlyphProps } from './Icon'

/** Panel marker: Adapters (pointing back: what the three ways hand back to the model). */
export function AdaptersMark(props: GlyphProps) {
  return <Icon name="triangle-y" direction="r270" {...props} />
}
