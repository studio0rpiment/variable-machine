import { Moon, Sun } from '../icons'
import type { ThemeMode } from '../themes'

/** Bare icon, no box (KP Minimal). Moon while dark, sun while light; click flips. */
export default function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  const next = mode === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="icon-button" onClick={onToggle} aria-label={`switch to ${next} theme`}>
      {mode === 'dark' ? <Moon size={1.5} /> : <Sun size={1.5} />}
    </button>
  )
}
