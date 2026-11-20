import type { ProductView, Store } from '../api/types'
import { useCart } from '../cart/CartContext'
import { config } from '../config'
import { formatINR, stockState } from '../lib/format'
import { ProductArt } from './ProductArt'
import { QuantityStepper } from './QuantityStepper'
import { useToast } from './Toast'

export function ProductCard({ view, store }: { view: ProductView; store: Store }) {
  const cart = useCart()
  const toast = useToast()
  const { product } = view
  const stock = stockState(view.pickable_quantity, config.lowStockThreshold)
  const line = cart.cart.store?.id === store.id ? cart.cart.items.find((i) => i.productId === product.id) : undefined
  const orderable = store.operating_status === 'OPEN'
  const out = stock.kind === 'out'

  function add() {
    const res = cart.add(
      { id: store.id, name: store.name },
      { productId: product.id, name: product.name, unit: product.unit, unitPrice: product.price, maxQty: stock.max },
    )
    toast.show(res === 'limit' ? `Only ${stock.max} available` : 'Added to cart')
    try { navigator.vibrate?.(8) } catch { /* haptics are optional */ }
  }

  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-surface p-2.5">
      <div className="relative">
        <ProductArt id={product.id} name={product.name} category={product.category} dim={out} className="aspect-square w-full" />
        {stock.kind === 'low' && <span className="absolute bottom-2 left-2 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold italic text-warn-600">{stock.label}</span>}
        {out && <span className="absolute bottom-2 left-2 rounded-full bg-bar px-2 py-0.5 text-xs font-bold text-white">Out of stock</span>}
      </div>
      <div className="flex flex-1 flex-col px-1 pt-2.5">
        <h3 className="line-clamp-2 min-h-10 text-base font-bold leading-5">{product.name}</h3>
        <p className="mt-0.5 text-sm italic text-ink-faint">{product.unit}</p>
        {stock.kind === 'in' && <span className="sr-only">{stock.label}</span>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-[17px] font-extrabold num">{formatINR(product.price)}</span>
          {/* Fixed width so swapping Add for the stepper never shifts the layout. */}
          <div className="flex h-10 w-[5.75rem] items-center justify-end">
            {line ? (
              <QuantityStepper size="sm" quantity={line.quantity} max={line.maxQty} label={product.name} onChange={(q) => cart.setQty(product.id, q)} />
            ) : (
              <button
                onClick={add}
                disabled={out || !orderable}
                aria-label={`Add ${product.name} to cart`}
                className="h-10 w-full rounded-xl border-2 border-cta-600 px-3 text-sm font-bold text-cta-ink transition-colors hover:bg-cta-50 active:scale-95 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:bg-transparent"
              >
                {out ? 'Sold out' : 'Add'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-2.5">
      <div className="skeleton aspect-square w-full rounded-[var(--radius-tile)]" />
      <div className="space-y-2 p-1 pt-3"><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-10 w-full rounded-xl" /></div>
    </div>
  )
}
