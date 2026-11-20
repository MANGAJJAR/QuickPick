import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AppNotification } from '../../api/types'
import { useNotifications } from '../../hooks/queries'
import { showSystemNotification } from '../../push/push'
import { BellIcon, CloseIcon } from '../../components/icons'

/**
 * Live alerts without a push service: the notification list is polled, and anything new that arrives
 * after the first load pops up here (and as a system notification when the tab is in the background).
 */
export function AlertToasts() {
  const list = useNotifications()
  const seen = useRef<Set<string> | null>(null)
  const [toasts, setToasts] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!list.data) return
    if (seen.current === null) { // first load: whatever is already there is not "new"
      seen.current = new Set(list.data.map((n) => n.id))
      return
    }
    const fresh = list.data.filter((n) => !n.read && !seen.current!.has(n.id))
    if (fresh.length === 0) return
    fresh.forEach((n) => seen.current!.add(n.id))
    setToasts((t) => [...fresh, ...t].slice(0, 3))
    if (document.visibilityState !== 'visible') fresh.forEach((n) => showSystemNotification(n.title, n.body, n.id))
  }, [list.data])

  useEffect(() => {
    if (toasts.length === 0) return
    const t = setTimeout(() => setToasts((all) => all.slice(0, -1)), 7000)
    return () => clearTimeout(t)
  }, [toasts])

  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} className="anim-rise pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-wheat-300 text-brand-700" aria-hidden="true"><BellIcon width={18} height={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{n.title}</p>
            <p className="text-sm text-ink-soft">{n.body}</p>
            {n.order_id && <Link to={`/orders/${n.order_id}`} onClick={() => setToasts((all) => all.filter((x) => x.id !== n.id))} className="mt-1 inline-block text-sm font-extrabold text-cta-ink">View order →</Link>}
          </div>
          <button onClick={() => setToasts((all) => all.filter((x) => x.id !== n.id))} aria-label="Dismiss alert" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-canvas"><CloseIcon width={16} height={16} /></button>
        </div>
      ))}
    </div>
  )
}
