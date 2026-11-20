import { useEffect, useState } from 'react'

/** Milliseconds until `iso` (negative once passed), ticking every second. 0 when there is no deadline. */
export function useCountdown(iso: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso])
  return iso ? new Date(iso).getTime() - now : 0
}
