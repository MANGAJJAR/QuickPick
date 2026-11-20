import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart/CartContext'
import { QuantityStepper } from '../components/QuantityStepper'
import { Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { useCartLines } from '../hooks/useCartLines'
import { usePreview } from '../hooks/queries'
import { formatINR } from '../lib/format'

export function CartPage() {
  const { cart, setQty, remove, clear } = useCart()
  const { storeId, lines } = useCartLines()
  const preview = usePreview(storeId, lines)
  useEffect(() => { document.title = 'Your cart · QuickPick' }, [])

  if (!cart.store || cart.items.length === 0) {
    return (
      <div>
        <PageTitle>Your cart</PageTitle>
        <EmptyState title="Your cart is empty" body="Add items from a nearby store to see how much you save by picking up." action={<ButtonLink to="/">Find a store</ButtonLink>} />
      </div>
    )
  }

  const lineTotal = (productId: string) => preview.data?.items.find((i) => i.product_id === productId)?.line_total

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle sub={<>Pickup from <Link className="font-bold text-brand-500 underline" to={`/store/${cart.store.id}`}>{cart.store.name}</Link></>}>Your cart</PageTitle>

      <Card className="divide-y divide-line">
        {cart.items.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.name}</p>
              <p className="text-sm text-ink-faint">{item.unit} · {formatINR(item.unitPrice)} each</p>
              <button onClick={() => remove(item.productId)} className="mt-1 text-sm font-semibold text-danger-600 underline" aria-label={`Remove ${item.name} from cart`}>Remove</button>
            </div>
            <div className="flex flex-col items-end gap-2">
              <QuantityStepper quantity={item.quantity} max={item.maxQty} label={item.name} onChange={(q) => setQty(item.productId, q)} />
              <span className="text-sm font-bold num">{lineTotal(item.productId) ? formatINR(lineTotal(item.productId)) : <Skeleton className="h-4 w-12" />}</span>
            </div>
          </div>
        ))}
      </Card>

      {preview.isError ? (
        <div className="mt-4"><ErrorState error={preview.error} onRetry={() => void preview.refetch()} title="Can’t price your cart" /></div>
      ) : (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-ink-soft">Subtotal</span>
            {preview.data ? <span className="text-lg font-bold num">{formatINR(preview.data.pricing.subtotal)}</span> : <Skeleton className="h-6 w-20" />}
          </div>
          {preview.data && (
            <p className="mt-2 rounded-lg bg-wheat-100 px-3 py-2 text-sm font-bold text-brand-700">{preview.data.message}. See the breakdown at checkout.</p>
          )}
          {preview.data
            ? <ButtonLink to="/checkout" className="mt-4 w-full text-lg">Go to checkout</ButtonLink>
            : <Button className="mt-4 w-full text-lg" disabled>Go to checkout</Button>}
        </Card>
      )}

      <div className="mt-3 text-center"><Button variant="ghost" size="sm" onClick={clear}>Clear cart</Button></div>
    </div>
  )
}
