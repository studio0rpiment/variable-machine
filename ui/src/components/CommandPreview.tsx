import { useState } from 'react'
import { Run } from '../icons'

interface Props {
  command: string
  onRun: () => void
  disabled?: boolean
  running?: boolean
  /** what the run control says to screen readers */
  label?: string
  /** set by an explanation flag (explain/Explained.tsx) */
  'aria-describedby'?: string
}

/**
 * Every action shows the command it will run before it runs it. Clicking the
 * line (or its arrow) runs exactly that, through the terminal.
 *
 * When it can't run yet it is aria-disabled rather than disabled: it looks
 * and acts disabled (a click does nothing, screen readers say unavailable),
 * but it still takes hover and focus, so its explanation flag can say what
 * it does. A disabled button gets no pointer events at all.
 *
 * After it has run it fades to 70%, so what's already done reads as done.
 */
export default function CommandPreview({ command, onRun, disabled, running, label = 'run', 'aria-describedby': describedBy }: Props) {
  const off = !!(disabled || running)
  // Once this exact command has run, it fades a little: done, though it can run again. A changed command is fresh.
  const [ran, setRan] = useState<string | null>(null)
  const done = ran === command && !running
  return (
    <button
      type="button"
      aria-describedby={describedBy}
      className={`command-preview ${running ? 'is-running' : ''} ${done ? 'is-done' : ''}`.replace(/\s+/g, ' ').trim()}
      onClick={() => {
        if (off) return
        setRan(command)
        onRun()
      }}
      aria-disabled={off || undefined}
      aria-label={`${label}: ${command}${running ? ' (running)' : ''}`}
    >
      <code>{command}</code>
      <Run size={1} />
    </button>
  )
}
