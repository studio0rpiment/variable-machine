import { Icon, type GlyphProps } from './Icon'

/** The terminal prompt glyph (forward, like a shell prompt). */
export function Prompt(props: GlyphProps) {
  return <Icon name="triangle-a" direction="r90" {...props} />
}
