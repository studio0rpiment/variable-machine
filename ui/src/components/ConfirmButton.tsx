// Copied from the Student Work Viewer (~/__DEV/__website-display/src/components/ConfirmButton.tsx), KP Minimal.
import { useState } from 'react'

interface Props {
  label: string
  confirmLabel?: string
  onConfirm: () => void
  className?: string
}

/**
 * Two-step destructive action, inline: click once to arm ("really? yes / no"),
 * again to fire. No modal. Arms reset on "no" or after firing.
 */
export default function ConfirmButton({ label, confirmLabel = 'really?', onConfirm, className = '' }: Props) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button type="button" className={`text-button text-button--danger ${className}`.trim()} onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="confirm">
      <span className="label label--muted">{confirmLabel}</span>
      <button
        type="button"
        className="text-button text-button--danger"
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        yes
      </button>
      <button type="button" className="text-button" onClick={() => setArmed(false)}>
        no
      </button>
    </span>
  )
}
