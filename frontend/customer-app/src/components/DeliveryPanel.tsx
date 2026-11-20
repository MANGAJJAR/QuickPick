import type { Order } from '../api/types'
import { Card } from './ui'

/** Where a delivery order is going and what to expect. Replaces the pickup QR and arrival panels. */
export function DeliveryPanel({ order }: { order: Order }) {
  const done = order.order_status === 'DELIVERED'
  const open = !['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(order.order_status)
  const status = order.order_status
  return (
    <Card className="p-5" aria-labelledby="delivery-title">
      <h2 id="delivery-title" className="text-lg font-extrabold">
        {done ? 'Delivered' : status === 'OUT_FOR_DELIVERY' ? 'On the way to you' : 'Delivery'}
      </h2>
      {open && order.delivery_eta_minutes != null && (
        <p className="mt-1 text-sm text-ink-soft">
          Estimated about <span className="num font-bold text-ink">{order.delivery_eta_minutes} min</span> from when it was placed. This is an estimate: it grows when riders are busy.
        </p>
      )}
      {order.delivery_address && (
        <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
          <p className="font-bold">Delivering to</p>
          <p className="text-ink-soft">{order.delivery_address.line}</p>
          {order.delivery_address.instructions && <p className="mt-1 italic text-ink-faint">“{order.delivery_address.instructions}”</p>}
        </div>
      )}
      {status === 'READY_FOR_PICKUP' && <p role="status" className="mt-3 rounded-xl bg-wheat-100 px-3 py-2 text-sm font-bold text-accent">Packed. Waiting for a rider to pick it up.</p>}
    </Card>
  )
}
