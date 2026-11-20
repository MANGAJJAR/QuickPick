import type { Order } from '../api/types'
import { formatDuration, secondsSince, shortId } from '../lib/format'
import { ArrivalBadge } from './ArrivalBadge'
import { ExpiryChip } from './ExpiryChip'
import { ClockIcon } from './icons'
import { OrderActions } from './OrderActions'
import { StatusChip } from './StatusChip'

interface Props {
  order: Order
  now: number
  flash?: boolean
  onOpen(id: string): void
}

/** Board card: order number, items and quantities, time since placed, one obvious primary action. */
export function OrderCard({ order, now, flash, onOpen }: Props) {
  const waiting = secondsSince(order.created_at, now)
  const late = order.order_status === 'PLACED' && waiting > 120 // visual urgency only
  return (
    <article className={`rounded-xl border-2 bg-surface p-3.5 ${flash ? 'anim-flash border-wheat-500' : order.arrival_status === 'ARRIVED' ? 'border-cta-600' : late ? 'border-st-placed/50' : 'border-line'}`} aria-label={`Order ${shortId(order.id)}`}>
      <button type="button" onClick={() => onOpen(order.id)} className="block w-full text-left" aria-label={`Open details for order ${shortId(order.id)}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-extrabold tracking-tight num">#{shortId(order.id)}</h3>
          <StatusChip status={order.order_status} type={order.order_type} />
        </div>
        <p className={`mt-1 flex items-center gap-1 text-sm font-bold num ${late ? 'text-st-placed' : 'text-ink-faint'}`}>
          <ClockIcon size={14} /> {formatDuration(waiting)} since placed
        </p>
        {order.order_type === 'DELIVERY' && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm"><span className="shrink-0 rounded-md bg-brand-100 px-1.5 py-0.5 text-xs font-extrabold text-accent">Delivery</span><span className="min-w-0 truncate text-ink-soft" title={order.delivery_address?.line}>{order.delivery_address?.line ?? 'No address'}</span></p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ArrivalBadge status={order.arrival_status} eta={order.arrival_eta_minutes} />
          <ExpiryChip order={order} now={now} />
        </div>
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-[15px]">
          {order.items.map((i) => (
            <li key={i.product_id} className="flex gap-2"><span className="w-8 shrink-0 font-extrabold num">{i.quantity}×</span><span className="min-w-0 truncate">{i.name}</span></li>
          ))}
        </ul>
      </button>
      <div className="mt-3"><OrderActions order={order} /></div>
    </article>
  )
}
