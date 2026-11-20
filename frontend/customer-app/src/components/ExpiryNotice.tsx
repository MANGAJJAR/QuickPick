import type { Order } from '../api/types'
import { formatClock } from '../lib/format'
import { useCountdown } from '../lib/useCountdown'
import { Card } from './ui'

/**
 * Deadline banner. The server expires the order and releases the stock; this only tells the customer about it:
 * - PLACED: the store has until `expires_at` to accept.
 * - READY_FOR_PICKUP: collect before `expires_at` or the order is released.
 */
export function ExpiryNotice({ order }: { order: Order }) {
  const live = order.order_status === 'PLACED' || order.order_status === 'READY_FOR_PICKUP'
  const remaining = useCountdown(live ? order.expires_at : null)

  if (order.order_status === 'EXPIRED') {
    return (
      <Card className="border-2 border-wheat-500 bg-wheat-50 p-5" role="status">
        <h2 className="text-lg font-extrabold">This order expired</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {order.ready_at
            ? 'It wasn’t collected in time, so the items went back on the shelf.'
            : 'The store didn’t accept it in time, so it was released.'}{' '}
          You can place a new order any time.
        </p>
      </Card>
    )
  }
  if (!live || !order.expires_at) return null

  const ready = order.order_status === 'READY_FOR_PICKUP'
  const urgent = remaining < 5 * 60_000
  return (
    <p
      role="timer"
      className={`rounded-2xl px-4 py-3 text-sm font-bold ${urgent ? 'bg-cta-50 text-cta-ink' : 'bg-wheat-100 text-accent'}`}
    >
      {remaining <= 0
        ? 'Time is up. This order is about to be released.'
        : ready
          ? <>Collect within <span className="num">{formatClock(remaining)}</span>. After that the order is released.</>
          : <>Waiting for the store to accept. It is released automatically in <span className="num">{formatClock(remaining)}</span> if they don’t.</>}
    </p>
  )
}
