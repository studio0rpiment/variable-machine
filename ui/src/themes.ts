/**
 * Copied from the Student Work Viewer (~/__DEV/__website-display/src/themes.ts), KP Minimal.
 *
 * Theme system. Each theme is a small set of colors; add a new entry here and
 * it becomes available everywhere. `mode` says which icon the toggle shows.
 */
export type ThemeMode = 'dark' | 'light'

export interface Theme {
  name: string
  mode: ThemeMode
  bg: string
  line: string
  /** the colour of things you click: terminal green */
  act: string
}

export const themes = {
  dark: { name: 'dark', mode: 'dark', bg: '#111613', line: '#FFF7E6', act: '#5CF25C' },
  light: { name: 'light', mode: 'light', bg: '#FFF7E6', line: '#111613', act: '#16752A' },
} satisfies Record<string, Theme>

export type ThemeName = keyof typeof themes

export const DEFAULT_THEME: ThemeName = 'dark'

/** Push a theme's colors onto :root as CSS custom properties. */
export function applyTheme(t: Theme) {
  const root = document.documentElement
  root.dataset.theme = t.name
  root.style.setProperty('--bg', t.bg)
  root.style.setProperty('--line', t.line)
  root.style.setProperty('--act', t.act)
  root.style.colorScheme = t.mode
}
