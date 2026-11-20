import { useCallback, useEffect, useState } from 'react'

/** "auto" follows the OS (prefers-color-scheme); "light"/"dark" force the theme via <html data-theme>. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

const KEY = 'qp-theme'
const ORDER: ThemeChoice[] = ['auto', 'light', 'dark']

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch { /* storage can be blocked; the theme still applies for this visit */ }
}

/** Current choice plus a `cycle()` that steps auto -> light -> dark. Applies the saved choice on mount. */
export function useTheme(): { choice: ThemeChoice; cycle(): void } {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)
  useEffect(() => { applyTheme(choice) }, [choice])
  const cycle = useCallback(() => setChoice((c) => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]!), [])
  return { choice, cycle }
}
