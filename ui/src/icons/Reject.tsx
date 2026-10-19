import { Icon, type GlyphProps } from './Icon'

/** Reject a generated row (pointing down and out). */
export function Reject(props: GlyphProps) {
  return <Icon name="triangle-a" direction="r180" {...props} />
}
