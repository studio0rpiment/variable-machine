import { Icon, type GlyphProps } from './Icon'

/** Panel marker: Train, the first way: imitate (pointing forward: learn by following examples). */
export function TrainMark(props: GlyphProps) {
  return <Icon name="triangle-y" direction="r90" {...props} />
}
