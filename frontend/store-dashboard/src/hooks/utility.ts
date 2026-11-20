import { useEffect, useRef, useState } from 'react'
import type { Order } from '../api/types'
import { playNewOrderChime } from '../lib/sound'

/** Current time, ticking every second (drives "time since placed" and preparation timers). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/**
 * Detects orders that newly appeared in the PLACED column. The first load is the baseline (no sound
 * for orders that were already waiting). Returns the ids to flash and plays a chime for new ones.
 */
export function useNewOrderAlert(placed: Order[] | undefined): Set<string> {
  const seen = useRef<Set<string> | null>(null)
  const [flashing, setFlashing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!placed) return
    const ids = new Set(placed.map((o) => o.id))
    if (seen.current === null) {
      seen.current = ids
      return
    }
    const fresh = [...ids].filter((id) => !seen.current!.has(id))
    seen.current = new Set([...seen.current, ...ids])
    if (fresh.length) {
      playNewOrderChime()
      setFlashing(new Set(fresh))
      const t = setTimeout(() => setFlashing(new Set()), 3500)
      return () => clearTimeout(t)
    }
  }, [placed])

  return flashing
}
