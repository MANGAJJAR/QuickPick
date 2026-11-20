import { useEffect } from 'react'
import { ApiError } from '../api/client'
import { useOrder } from '../hooks/queries'
import { useNow } from '../hooks/utility'
import { formatDateTime, formatDuration, formatINR, secondsSince, shortId } from '../lib/format'
import { XIcon } from './icons'
import { OrderActions } from './OrderActions'
import { StatusChip } from './StatusChip'
import { Button, ErrorState, Skeleton } from './ui'

/** Right-hand drawer with the full order: items, totals, status history and the preparation timer. */
export function OrderDrawer({ orderId, onClose }: { orderId: string; onClose(): void }) {
  const q = useOrder(orderId)
  const now = useNow()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const o = q.data
  const prepStart = o?.preparing_at ?? o?.accepted_at ?? null
  const prepEnd = o?.ready_at ?? (o && ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(o.order_status) ? o.updated_at : null)
  const prepSeconds = prepStart ? Math.max(0, Math.floor(((prepEnd ? Date.parse(prepEnd) : now) - Date.parse(prepStart)) / 1000)) : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Order ${shortId(orderId)} details`} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-surface p-4">
          <div>
            <h2 className="text-2xl font-extrabold num">#{shortId(orderId)}</h2>
            {o && <StatusChip status={o.order_status} />}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close order details"><XIcon /></Button>
        </header>

        {q.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : q.isError ? (
          <div className="p-4"><ErrorState error={q.error} onRetry={() => void q.refetch()} title={q.error instanceof ApiError && q.error.status === 404 ? 'Order not found' : undefined} /></div>
        ) : (
          <div className="space-y-5 p-4">
            <OrderActions order={q.data} size="md" />

            <section>
              <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-ink-faint">Items</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {q.data.items.map((i) => (
                  <li key={i.product_id} className="flex items-center justify-between gap-3 p-2.5">
                    <span><b className="num">{i.quantity}×</b> {i.name}</span>
                    <span className="num text-sm text-ink-soft">{formatINR(i.line_total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-0.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="num">{formatINR(q.data.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Pickup discount</dt><dd className="num">−{formatINR(q.data.pickup_discount)}</dd></div>
                <div className="flex justify-between text-base font-extrabold"><dt>Customer pays</dt><dd className="num">{formatINR(q.data.total_amount)}</dd></div>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-ink-faint">Timing</h3>
              <dl className="space-y-0.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Placed</dt><dd>{formatDateTime(q.data.created_at)} · {formatDuration(secondsSince(q.data.created_at, now))} ago</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Preparation time</dt><dd className="num font-bold" data-testid="prep-timer">{prepSeconds === null ? 'Not started' : formatDuration(prepSeconds)}</dd></div>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-ink-faint">Customer</h3>
              <p className="text-sm text-ink-soft">Customer ID <b className="font-mono text-ink">{q.data.customer_id.slice(0, 10)}</b>. Name and phone are not exposed to store staff by the API; the customer proves identity with their QR or code at the counter.</p>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-extrabold uppercase tracking-wide text-ink-faint">History</h3>
              <ol className="space-y-2">
                {[...q.data.status_history].reverse().map((e, idx) => (
                  <li key={`${e.status}-${e.at}-${idx}`} className="flex items-start gap-3 text-sm">
                    <StatusChip status={e.status} />
                    <span className="text-ink-soft">{formatDateTime(e.at)}{e.note ? ` · ${e.note}` : ''}</span>
                  </li>
                ))}
              </ol>
              {q.data.cancel_reason && <p className="mt-2 text-sm font-semibold text-danger-600">Reason: {q.data.cancel_reason}</p>}
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}
