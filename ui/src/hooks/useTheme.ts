// Copied from the Student Work Viewer (~/__DEV/__website-display/src/hooks/useTheme.ts), KP Minimal.
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, applyTheme, themes, type ThemeName } from '../themes'

/**
 * Holds the active theme name and applies it to the document whenever it
 * changes. Always starts on DEFAULT_THEME (dark) — no persistence by design.
 */
export function useTheme() {
  const [name, setName] = useState<ThemeName>(DEFAULT_THEME)

  useEffect(() => {
    applyTheme(themes[name])
  }, [name])

  /** Flip between the dark and light entries. */
  const toggle = useCallback(() => {
    setName((n) => (themes[n].mode === 'dark' ? 'light' : 'dark'))
  }, [])

  return { name, theme: themes[name], setTheme: setName, toggle }
}
