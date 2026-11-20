import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import type { OrderType } from '../api/types'
import { useCart } from '../cart/CartContext'
import { AddressForm, FulfilmentChoice, useSavedAddress } from '../components/FulfilmentChoice'
import { BillSummary } from '../components/BillSummary'
import { WalkBanner } from '../components/WalkBanner'
import { Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useCartLines } from '../hooks/useCartLines'
import { useGeolocation } from '../hooks/useGeolocation'
import { keys, usePreview } from '../hooks/queries'
import { formatINR } from '../lib/format'
import { cartSignature, clearKey, getOrCreateKey } from '../lib/idempotency'

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

          {delivery && <AddressForm address={address} onChange={setAddress} />}

          <BillSummary
            pricing={delivery ? preview.data.delivery! : preview.data.pricing}
            mode={delivery ? 'DELIVERY' : 'PICKUP'}
            compareAt={preview.data.delivery?.total_amount}
          />
          {delivery && Number(preview.data.pricing.you_save) > 0 && (
            <p className="rounded-2xl bg-wheat-100 px-4 py-3 text-sm font-bold text-accent" role="status">
              Pickup would save you {formatINR(preview.data.pricing.you_save)} on this order.
            </p>
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
