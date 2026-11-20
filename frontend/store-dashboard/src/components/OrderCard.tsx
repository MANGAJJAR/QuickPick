import type { Order } from '../api/types'
import { formatDuration, secondsSince, shortId } from '../lib/format'
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
    <article className={`rounded-xl border-2 bg-surface p-3.5 ${flash ? 'anim-flash border-amber-400' : late ? 'border-st-placed/50' : 'border-line'}`} aria-label={`Order ${shortId(order.id)}`}>
      <button type="button" onClick={() => onOpen(order.id)} className="block w-full text-left" aria-label={`Open details for order ${shortId(order.id)}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-extrabold tracking-tight num">#{shortId(order.id)}</h3>
          <StatusChip status={order.order_status} />
        </div>
        <p className={`mt-1 flex items-center gap-1 text-sm font-bold num ${late ? 'text-st-placed' : 'text-ink-faint'}`}>
          <ClockIcon size={14} /> {formatDuration(waiting)} since placed
        </p>
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
