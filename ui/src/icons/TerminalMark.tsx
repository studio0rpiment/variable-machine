import { Icon, type GlyphProps } from './Icon'

/** Panel marker: Terminal (forward, like a prompt). */
export function TerminalMark(props: GlyphProps) {
  return <Icon name="triangle-b" direction="r90" {...props} />
}
