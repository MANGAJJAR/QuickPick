import { Link } from 'react-router-dom'
import { useCart } from '../cart/CartContext'
import { ESTIMATED_MAX_MINUTES, useReadyBy } from '../lib/eta'
import { formatINR } from '../lib/format'
import { useCartLines } from '../hooks/useCartLines'
import { usePreview } from '../hooks/queries'
import { BillSummary } from './BillSummary'
import { ProductArt } from './ProductArt'
import { QuantityStepper } from './QuantityStepper'
import { ButtonLink, Skeleton } from './ui'

/**
 * "Your order": the cart as a side panel (web) or inside the bottom sheet (mobile).
 * Every rupee figure comes from the server's checkout preview; nothing is added up here.
 */
export function CartPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { cart, setQty } = useCart()
  const { storeId, lines } = useCartLines()
  const preview = usePreview(storeId, lines)
  const ready = useReadyBy()

  if (!cart.store || cart.items.length === 0) {
    return (
      <div className="p-5">
        <h2 className="text-xl font-bold">Your order</h2>
        <p className="mt-2 text-sm text-ink-soft">Your cart is empty. Add items from a store to see them here.</p>
        <ButtonLink to="/" variant="secondary" className="mt-4 w-full" onClick={onNavigate}>Find a store</ButtonLink>
      </div>
    )
  }

  const lineTotal = (id: string) => preview.data?.items.find((i) => i.product_id === id)?.line_total
  const p = preview.data?.pricing

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-5 pb-3 pr-14">
        <h2 className="text-xl font-bold">Your order</h2>
        <p className="mt-0.5 text-sm text-ink-soft">Pickup from <Link to={`/store/${cart.store.id}`} onClick={onNavigate} className="font-bold text-accent underline">{cart.store.name}</Link></p>
      </div>

      <div className="mx-5 flex shrink-0 items-center justify-between rounded-xl bg-brand-50 px-4 py-3" aria-label="Estimated pickup time">
        <div>
          <p className="text-sm font-bold">Ready by <span className="num">{ready}</span></p>
          <p className="text-xs italic text-ink-faint">Estimate, after the store accepts</p>
        </div>
        <p className="num text-lg font-extrabold">{ESTIMATED_MAX_MINUTES - 5}-{ESTIMATED_MAX_MINUTES}<span className="ml-1 text-sm font-semibold italic text-ink-soft">min</span></p>
      </div>

      <ul className="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto px-5">
        {cart.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-3 py-3">
            <ProductArt id={item.productId} name={item.name} category="" className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{item.name}</p>
              <p className="text-xs italic text-ink-faint">{item.unit}</p>
              <p className="num mt-0.5 text-sm font-bold">{lineTotal(item.productId) ? formatINR(lineTotal(item.productId)) : <Skeleton className="inline-block h-4 w-12 align-middle" />}</p>
            </div>
            <QuantityStepper size="sm" quantity={item.quantity} max={item.maxQty} label={item.name} onChange={(q) => setQty(item.productId, q)} />
          </li>
        ))}
      </ul>

      <div className="shrink-0 border-t border-line p-5">
        {preview.isError ? (
          <p role="alert" className="text-sm font-semibold text-danger-600">We can’t price your cart right now. Check your connection and try again.</p>
        ) : (
          p ? <BillSummary compact pricing={p} mode="PICKUP" compareAt={preview.data?.delivery?.total_amount} /> : <Skeleton className="h-24 w-full" />
        )}
        <ButtonLink to="/checkout" className="mt-4 w-full" onClick={onNavigate} aria-disabled={!preview.data}>
          {p ? `Continue to checkout ${formatINR(p.total_amount)}` : 'Continue to checkout'}
        </ButtonLink>
      </div>
    </div>
  )
}
