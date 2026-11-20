import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { OrderStatus } from '../api/types'
import { Badge, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useOrders } from '../hooks/queries'
import { formatDateTime, formatINR, shortId } from '../lib/format'

const LABEL: Record<OrderStatus, { text: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  CREATED: { text: 'Placing', tone: 'neutral' },
  PLACED: { text: 'Placed', tone: 'neutral' },
  ACCEPTED: { text: 'Accepted', tone: 'good' },
  PREPARING: { text: 'Preparing', tone: 'good' },
  READY_FOR_PICKUP: { text: 'Ready', tone: 'warn' },
  OUT_FOR_DELIVERY: { text: 'On the way', tone: 'warn' },
  DELIVERED: { text: 'Delivered', tone: 'good' },
  COMPLETED: { text: 'Picked up', tone: 'good' },
  CANCELLED: { text: 'Cancelled', tone: 'bad' },
  EXPIRED: { text: 'Expired', tone: 'bad' },
}

export function OrdersPage() {
  const orders = useOrders()
  useEffect(() => { document.title = 'Your orders · QuickPick' }, [])

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Your orders</PageTitle>
      {orders.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading orders">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.items.length === 0 ? (
        <EmptyState title="No orders yet" body="Your pickup orders will show up here." action={<ButtonLink to="/">Find a store</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {orders.data.items.map((o) => {
            const base = LABEL[o.order_status]
            // The same status reads differently for a delivery that is packed and waiting for a rider.
            const s = o.order_type === 'DELIVERY' && o.order_status === 'READY_FOR_PICKUP' ? { text: 'Packed', tone: 'warn' as const } : o.order_type === 'PICKUP' && o.order_status === 'READY_FOR_PICKUP' ? { text: 'Ready for pickup', tone: 'warn' as const } : base
            return (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="block" aria-label={`Order ${shortId(o.id)}, ${s.text}`}>
                  <Card className="p-4 transition-">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">Order #{shortId(o.id)} <span className="ml-1 text-sm font-semibold text-ink-faint">{o.order_type === 'DELIVERY' ? '· Delivery' : '· Pickup'}</span></p>
                        <p className="text-sm text-ink-soft">{formatDateTime(o.created_at)} · {o.items.reduce((n, i) => n + i.quantity, 0)} items</p>
                      </div>
                      <Badge tone={s.tone}>{s.text}</Badge>
                    </div>
                    <p className="mt-2 text-lg font-bold num">{formatINR(o.total_amount)}</p>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
