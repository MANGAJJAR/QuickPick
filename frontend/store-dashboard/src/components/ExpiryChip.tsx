import type { Order } from '../api/types'
import { formatDuration } from '../lib/format'
import { ClockIcon } from './icons'

/** Auto-expiry countdown. PLACED: accept before this; READY: the customer must collect before this. */
export function ExpiryChip({ order, now }: { order: Pick<Order, 'order_status' | 'expires_at'>; now: number }) {
  if (!order.expires_at || (order.order_status !== 'PLACED' && order.order_status !== 'READY_FOR_PICKUP')) return null
  const left = Math.floor((Date.parse(order.expires_at) - now) / 1000)
  const urgent = left < 300
  const label = order.order_status === 'PLACED' ? 'Accept within' : 'Held for'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold num ${urgent ? 'text-cta-ink' : 'text-ink-faint'}`} title="Orders nobody acts on are released automatically so stock is never stuck">
      <ClockIcon size={12} /> {left <= 0 ? 'Expiring now' : `${label} ${formatDuration(left)}`}
    </span>
  )
}
