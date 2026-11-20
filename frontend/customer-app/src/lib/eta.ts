import { useEffect, useState } from 'react'

/** Upper end of the estimated prep time shown as a promise. The API has no prep time, so this is a labelled estimate. */
export const ESTIMATED_MAX_MINUTES = 15

/** "10:36 pm" in the user's local time, lowercase am/pm. */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?(am|pm)/i, (_, ap: string) => ` ${ap.toLowerCase()}`)
}

/** Clock time when an order placed now would be ready, per the estimate. */
export function readyBy(now: Date = new Date(), minutes: number = ESTIMATED_MAX_MINUTES): string {
  return formatClockTime(new Date(now.getTime() + minutes * 60_000))
}

/** Re-reads the clock every minute so "ready by" never goes stale on a screen left open. */
export function useReadyBy(minutes: number = ESTIMATED_MAX_MINUTES): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return readyBy(now, minutes)
}
