import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import type { CheckoutPreview } from '../api/types'
import { useCart } from '../cart/CartContext'
import { Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useCartLines } from '../hooks/useCartLines'
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

/** The savings moment: the hero of checkout. Text comes from the backend. */
export function SavingsHero({ preview }: { preview: CheckoutPreview }) {
  return (
    <div className="rounded-card bg-brand-700 p-5 text-white" role="status">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-200">Pickup saves you</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight num" data-testid="you-save">{formatINR(preview.pricing.you_save)}</p>
      <p className="mt-1 text-brand-100">{preview.message}</p>
    </div>
  )
}

export function Comparison({ preview }: { preview: CheckoutPreview }) {
  const p = preview.pricing
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label="Delivery versus pickup">
      <Card className="p-4">
        <h3 className="text-base font-bold">Delivery</h3>
        <p className="mb-2 text-xs font-medium text-ink-faint">Estimated</p>
        <Row label="Items" value={formatINR(p.subtotal)} />
        <Row label="Delivery fee (est.)" value={`≈ ${formatINR(p.rider_cost_saved)}`} />
        <Row label="Pickup discount" value="Not available" muted />
        <p className="mt-2 text-xs text-ink-faint">Illustrative: based on an average rider cost, not a quote.</p>
      </Card>
      <Card className="border-2 border-brand-600 p-4">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold">QuickPick Pickup</h3><span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">Pickup</span></div>
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
  const preview = usePreview(storeId, lines)
  const signature = storeId ? cartSignature(storeId, lines) : ''
  // The key lives in a ref (and sessionStorage): re-renders, retries and double taps reuse it.
  const keyRef = useRef<{ signature: string; key: string } | null>(null)
  const placing = useRef(false)
  useEffect(() => { document.title = 'Checkout · QuickPick' }, [])

  const place = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error('Cart is empty')
      if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: getOrCreateKey(signature) }
      return api.createOrder(storeId, lines, keyRef.current.key)
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle sub={<>Pickup from <strong className="text-ink">{cart.store.name}</strong></>}>Checkout</PageTitle>

      {preview.isError ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} title="Can’t price your order" />
      ) : !preview.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Calculating your savings"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <div className="space-y-4">
          <SavingsHero preview={preview.data} />
          <Comparison preview={preview.data} />

          <Card className="p-4">
            <h3 className="mb-1 text-base font-bold">Your items</h3>
            <ul className="divide-y divide-line">
              {preview.data.items.map((i) => (
                <li key={i.product_id} className="flex items-center justify-between py-2 text-sm">
                  <span>{i.quantity} × {i.name}</span><span className="font-semibold num">{formatINR(i.line_total)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {err && (
            <div role="alert" className="rounded-card border border-danger-600/25 bg-danger-50 p-4 text-sm text-danger-600">
              <p className="font-semibold">{err instanceof ApiError && err.isNetwork ? 'No connection. Your order was not lost, tap Place order to try again safely.' : err.message}</p>
              {stockProblem && <p className="mt-1"><Link className="font-semibold underline" to="/cart">Review your cart</Link></p>}
            </div>
          )}

          <div className="sticky bottom-14 -mx-4 bg-canvas/95 px-4 pb-3 pt-3 backdrop-blur md:bottom-0">
            <Button className="w-full text-lg" loading={place.isPending} onClick={onPlace} disabled={!preview.data}>
              Place pickup order · {formatINR(preview.data.pricing.total_amount)}
            </Button>
            <p className="mt-2 text-center text-xs text-ink-faint">Tapping twice is safe: we only ever create one order.</p>
          </div>
        </div>
      )}
    </div>
  )
}
