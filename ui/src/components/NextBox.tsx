import type { ReactNode } from 'react'

/**
 * Room for a dashed box around one step's controls, as on the gesture tab.
 * The box shows when that step is the next one to do: it flashes as it
 * arrives, then stays until it is done. The room is always there, so nothing
 * moves when it appears.
 */
export default function NextBox({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={`next-box ${on ? 'is-next' : ''}`.trim()}>{children}</div>
}
