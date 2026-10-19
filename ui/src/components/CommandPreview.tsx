import { Run } from '../icons'

interface Props {
  command: string
  onRun: () => void
  disabled?: boolean
  running?: boolean
  /** what the run control says to screen readers */
  label?: string
}

/**
 * Every action shows the command it will run before it runs it. Clicking the
 * line (or its arrow) runs exactly that, through the terminal.
 */
export default function CommandPreview({ command, onRun, disabled, running, label = 'run' }: Props) {
  return (
    <button type="button" className={`command-preview ${running ? 'is-running' : ''}`.trim()} onClick={onRun} disabled={disabled || running} title={running ? 'running…' : `run: ${command}`} aria-label={`${label}: ${command}`}>
      <code>{command}</code>
      <Run size={1} />
    </button>
  )
}
