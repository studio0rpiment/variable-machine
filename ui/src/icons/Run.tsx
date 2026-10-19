import { Icon, type GlyphProps } from './Icon'

/** Run / send (pointing forward, like play). */
export function Run(props: GlyphProps) {
  return <Icon name="triangle-a" direction="r90" {...props} />
}
