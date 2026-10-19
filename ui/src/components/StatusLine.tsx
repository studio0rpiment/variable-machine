import { connect } from '../lib/helper'
import { useHelperState } from '../hooks/useHelper'

/** What the helper found at startup (plan §3.1.8), as small labels. Missing pieces are struck through. */
export default function StatusLine() {
  const { connected, status } = useHelperState()
  if (!connected)
    return (
      <span className="status">
        <span className="label">helper offline</span>
        <button type="button" className="text-button" onClick={connect}>
          reconnect
        </button>
      </span>
    )
  if (!status) return null
  const item = (ok: boolean, text: string, why: string) => (
    <span className={`label ${ok ? '' : 'is-missing'}`} title={ok ? text : why}>
      {text}
    </span>
  )
  return (
    <span className="status">
      {item(status.ollama, status.ollamaVersion ? `ollama ${status.ollamaVersion}` : 'ollama', 'ollama not reachable on 11434')}
      {item(status.uv, 'uv', 'uv not on PATH')}
      {item(status.mlx, 'mlx-lm', 'run: uv sync --project python')}
      <span className="label label--muted">
        {status.memoryGB}gb · tier {status.tier}
      </span>
    </span>
  )
}
