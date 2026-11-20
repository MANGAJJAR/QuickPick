import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import { CUSTOMER_CANCELLABLE } from '../api/types'
import { ArrivalPanel } from '../components/ArrivalPanel'
import { DeliveryPanel } from '../components/DeliveryPanel'
import { ExpiryNotice } from '../components/ExpiryNotice'
import { OrderStepper } from '../components/OrderStepper'
import { PickupPanel } from '../components/PickupPanel'
import { BackIcon } from '../components/icons'
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useCancelOrder, useOrder, useStore } from '../hooks/queries'
import { formatDateTime, formatINR, shortId } from '../lib/format'

export function OrderPage() {
  const { orderId = '' } = useParams()
  const api = useApi()
  const order = useOrder(orderId)
  const store = useStore(order.data?.store_id ?? '')
  const cancel = useCancelOrder(orderId)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => { document.title = `Order ${shortId(orderId)} · QuickPick` }, [orderId])

  if (order.isPending) return <div className="mx-auto max-w-2xl space-y-3" aria-busy="true" aria-label="Loading order"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>
  if (order.isError) {
    return order.error instanceof ApiError && order.error.status === 404
      ? <EmptyState title="Order not found" body="This order doesn’t exist or belongs to another account." action={<ButtonLink to="/orders" variant="secondary">Your orders</ButtonLink>} />
      : <ErrorState error={order.error} onRetry={() => void order.refetch()} />
  }

  const o = order.data
  const canCancel = CUSTOMER_CANCELLABLE.includes(o.order_status)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft"><BackIcon width={18} height={18} />Your orders</Link>
      <PageTitle sub={<>{store.data?.name ?? 'Store'} · placed {formatDateTime(o.created_at)}</>}>Order #{shortId(o.id)}</PageTitle>

      <ExpiryNotice order={o} />
      {o.order_type === 'DELIVERY' ? <DeliveryPanel order={o} /> : <><PickupPanel orderId={o.id} status={o.order_status} /><ArrivalPanel order={o} /></>}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Status</h2>
          {order.isFetching && !order.isPending && <span className="text-xs text-ink-faint" aria-live="polite">Updating…</span>}
        </div>
        <OrderStepper status={o.order_status} history={o.status_history} type={o.order_type} />
        {o.order_status === 'CANCELLED' && o.cancel_reason && <p className="mt-3 text-sm text-ink-soft">Reason: {o.cancel_reason}</p>}
      </Card>

      {store.data && o.order_type === 'PICKUP' && o.order_status !== 'COMPLETED' && o.order_status !== 'CANCELLED' && o.order_status !== 'EXPIRED' && (
        <Card className="p-4 text-sm"><p className="font-semibold">Pickup address</p><p className="text-ink-soft">{store.data.name}, {store.data.address}</p></Card>
      )}

      <Card className="p-5">
        <h2 className="mb-2 text-lg font-bold">Summary</h2>
        <ul className="divide-y divide-line text-sm">
          {o.items.map((i) => <li key={i.product_id} className="flex justify-between py-2"><span>{i.quantity} × {i.name}</span><span className="num font-semibold">{formatINR(i.line_total)}</span></li>)}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Items</dt><dd className="num">{formatINR(o.subtotal)}</dd></div>
          {o.order_type === 'DELIVERY'
            ? <div className="flex justify-between"><dt className="text-ink-soft">Delivery fee</dt><dd className="num">{Number(o.delivery_fee) === 0 ? 'Free' : formatINR(o.delivery_fee)}</dd></div>
            : <div className="flex justify-between"><dt className="text-ink-soft">Pickup discount</dt><dd className="num text-success">−{formatINR(o.pickup_discount)}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="num">{formatINR(o.total_amount)}</dd></div>
        </dl>
      </Card>

      {canCancel && (
        <Card className="p-4">
          {confirming ? (
            <div>
              <p className="font-semibold">Cancel this order?</p>
              <p className="text-sm text-ink-soft">Your items will be released back to the store.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}>Yes, cancel order</Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>Keep order</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>Cancel order</Button>
          )}
          {cancel.isError && <p role="alert" className="mt-2 text-sm text-danger-600">{cancel.error.message}</p>}
        </Card>
      )}

      {api.mockCompleteOrder && o.order_status === 'READY_FOR_PICKUP' && (
        <Card className="border-dashed p-4">
          <Badge tone="warn">Mock mode</Badge>
          <p className="mt-2 text-sm text-ink-soft">Simulate the store scanning your QR code.</p>
          <Button className="mt-2" variant="secondary" size="sm" onClick={() => void api.mockCompleteOrder?.(o.id).then(() => order.refetch())}>Simulate store scan</Button>
        </Card>
      )}
    </div>
  )
}
