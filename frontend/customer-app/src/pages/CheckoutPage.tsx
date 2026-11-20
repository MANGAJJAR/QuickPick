import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import type { CheckoutPreview, OrderType } from '../api/types'
import { useCart } from '../cart/CartContext'
import { AddressForm, FulfilmentChoice, useSavedAddress } from '../components/FulfilmentChoice'
import { WalkBanner } from '../components/WalkBanner'
import { Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useCartLines } from '../hooks/useCartLines'
import { useGeolocation } from '../hooks/useGeolocation'
import { keys, usePreview } from '../hooks/queries'
import { formatINR } from '../lib/format'
import { cartSignature, clearKey, getOrCreateKey } from '../lib/idempotency'

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'text-lg font-bold' : 'text-sm'} ${muted ? 'text-ink-faint' : ''}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  )
}

/** The savings moment: the hero of the pickup checkout. Text comes from the backend. */
export function SavingsHero({ preview }: { preview: CheckoutPreview }) {
  return (
    <div className="rounded-[var(--radius-banner)] bg-brand-600 p-6 text-white" role="status">
      <p className="inline-block rounded-full bg-wheat-300 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-brand-700">Pickup saves you</p>
      <p className="mt-3 text-6xl font-extrabold tracking-[-0.03em] text-wheat-300 num" data-testid="you-save">{formatINR(preview.pricing.you_save)}</p>
      <p className="mt-2 text-white/80">{preview.message}</p>
    </div>
  )
}

export function Comparison({ preview }: { preview: CheckoutPreview }) {
  const p = preview.pricing
  const d = preview.delivery
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label="Delivery versus pickup">
      <Card className="p-4">
        <h3 className="text-base font-bold">Delivery</h3>
        <p className="mb-2 text-xs font-medium text-ink-faint">Estimated</p>
        <Row label="Items" value={formatINR(p.subtotal)} />
        {d
          ? <Row label="Delivery fee" value={Number(d.delivery_fee) === 0 ? 'Free' : formatINR(d.delivery_fee)} />
          : <Row label="Delivery fee (est.)" value={`≈ ${formatINR(p.rider_cost_saved)}`} />}
        <Row label="Pickup discount" value="Not available" muted />
        {d
          ? <div className="mt-1 border-t border-line pt-1"><Row label="You pay" value={formatINR(d.total_amount)} strong /></div>
          : <p className="mt-2 text-xs text-ink-faint">Illustrative: based on an average rider cost, not a quote.</p>}
      </Card>
      <Card className="border-2 border-brand-500 bg-brand-50 p-4">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold">QuickPick Pickup</h3><span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-extrabold text-white">Pickup</span></div>
        <p className="mb-2 text-xs font-medium text-ink-faint">Collect from the store</p>
        <Row label="Items" value={formatINR(p.subtotal)} />
        <Row label="Delivery fee" value={formatINR(p.delivery_fee)} />
        <Row label="Pickup discount" value={`−${formatINR(p.pickup_discount)}`} />
        <Row label="Service fee" value="Paid by the store" />
        <div className="mt-1 border-t border-line pt-1"><Row label="You pay" value={formatINR(p.total_amount)} strong /></div>
      </Card>
    </div>
  )
}

export function CheckoutPage() {
  const api = useApi()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { cart, clear } = useCart()
  const { storeId, lines } = useCartLines()
  const geo = useGeolocation()
  const preview = usePreview(storeId, lines, geo.coords)
  const [fulfilment, setFulfilment] = useState<OrderType>('PICKUP')
  const [address, setAddress] = useSavedAddress()
  const addressOk = address.line.trim().length >= 5
  // Fulfilment and address are part of the key: switching to delivery after a failed pickup attempt is a different order.
  const signature = storeId ? cartSignature(storeId, lines, fulfilment === 'DELIVERY' ? `D|${address.line.trim()}` : 'P') : ''
  // The key lives in a ref (and sessionStorage): re-renders, retries and double taps reuse it.
  const keyRef = useRef<{ signature: string; key: string } | null>(null)
  const placing = useRef(false)
  useEffect(() => { document.title = 'Checkout · QuickPick' }, [])

  const place = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error('Cart is empty')
      if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: getOrCreateKey(signature) }
      return api.createOrder(storeId, lines, keyRef.current.key, {
        fulfilment,
        address: fulfilment === 'DELIVERY' ? { ...address, line: address.line.trim(), instructions: address.instructions?.trim() || null } : undefined,
        location: geo.coords,
      })
    },
    onSuccess: ({ order }) => {
      clearKey(signature)
      keyRef.current = null
      clear()
      void qc.invalidateQueries({ queryKey: keys.orders })
      qc.setQueryData(keys.order(order.id), order)
      navigate(`/orders/${order.id}`, { replace: true })
    },
    onSettled: () => { placing.current = false },
  })

  function onPlace() {
    if (placing.current) return // guard against double taps before the button re-renders as disabled
    placing.current = true
    place.mutate()
  }

  if (!cart.store || cart.items.length === 0) {
    return <EmptyState title="Nothing to check out" body="Your cart is empty." action={<ButtonLink to="/">Find a store</ButtonLink>} />
  }

  const err = place.error
  const stockProblem = err instanceof ApiError && (err.code === 'insufficient_stock' || err.code === 'store_not_accepting_orders' || err.code === 'store_at_capacity')
  const delivery = fulfilment === 'DELIVERY' && !!preview.data?.delivery
  const payable = preview.data ? (delivery ? preview.data.delivery!.total_amount : preview.data.pricing.total_amount) : null

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub={<>{delivery ? 'Delivery' : 'Pickup'} from <strong className="text-ink">{cart.store.name}</strong></>}>Checkout</PageTitle>

      {preview.isError ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} title="Can’t price your order" />
      ) : !preview.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Calculating your savings"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <div className="space-y-4">
          <WalkBanner offer={preview.data.offer} />
          <FulfilmentChoice preview={preview.data} value={fulfilment} onChange={setFulfilment} coords={geo.coords} />

          {delivery ? (
            <>
              <AddressForm address={address} onChange={setAddress} />
              {Number(preview.data.pricing.you_save) > 0 && (
                <p className="rounded-2xl bg-wheat-100 px-4 py-3 text-sm font-bold text-accent" role="status">
                  Pickup would save you {formatINR(preview.data.pricing.you_save)} on this order.
                </p>
              )}
            </>
          ) : (
            <>
              <SavingsHero preview={preview.data} />
              <Comparison preview={preview.data} />
            </>
          )}

          <Card className="p-4">
            <h3 className="mb-1 text-base font-bold">Your items</h3>
            <ul className="divide-y divide-line">
              {preview.data.items.map((i) => (
                <li key={i.product_id} className="flex items-center justify-between py-2 text-sm">
                  <span>{i.quantity} × {i.name}</span><span className="font-semibold num">{formatINR(i.line_total)}</span>
                </li>
              ))}
            </ul>
            {delivery && (
              <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Delivery fee</dt><dd className="num">{Number(preview.data.delivery!.delivery_fee) === 0 ? 'Free' : formatINR(preview.data.delivery!.delivery_fee)}</dd></div>
                <div className="flex justify-between text-base font-bold"><dt>You pay</dt><dd className="num">{formatINR(preview.data.delivery!.total_amount)}</dd></div>
              </dl>
            )}
          </Card>

          {err && (
            <div role="alert" className="rounded-card border border-danger-600/25 bg-danger-50 p-4 text-sm text-danger-600">
              <p className="font-semibold">{err instanceof ApiError && err.isNetwork ? 'No connection. Your order was not lost, tap Place order to try again safely.' : err.message}</p>
              {stockProblem && <p className="mt-1"><Link className="font-semibold underline" to="/cart">Review your cart</Link></p>}
            </div>
          )}

          <div className="sticky bottom-16 -mx-5 bg-canvas px-5 pb-3 pt-3 min-[960px]:bottom-0 min-[960px]:mx-0 min-[960px]:px-0">
            <Button className="w-full text-lg" loading={place.isPending} onClick={onPlace} disabled={!preview.data || (delivery && !addressOk)}>
              Place {delivery ? 'delivery' : 'pickup'} order · {formatINR(payable)}
            </Button>
            {delivery && !addressOk && <p className="mt-2 text-center text-xs text-ink-faint">Add your delivery address to continue.</p>}
            <p className="mt-2 text-center text-xs text-ink-faint">Tapping twice is safe: we only ever create one order.</p>
          </div>
        </div>
      )}
    </div>
  )
}
