import { useState } from 'react'
import type { ProductView, Store } from '../api/types'
import { useCart } from '../cart/CartContext'
import { config } from '../config'
import { formatINR, stockState } from '../lib/format'
import { categoryEmoji } from '../lib/categories'
import { QuantityStepper } from './QuantityStepper'

// Palette-only tile tints. There are no product photos yet, so each tile gets a category emoji.
const TINTS = ['bg-wheat-100', 'bg-brand-50', 'bg-cta-50', 'bg-wheat-50', 'bg-brand-100']
function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973
  return h
}

export function ProductCard({ view, store }: { view: ProductView; store: Store }) {
  const cart = useCart()
  const { product } = view
  const stock = stockState(view.pickable_quantity, config.lowStockThreshold)
  const line = cart.cart.store?.id === store.id ? cart.cart.items.find((i) => i.productId === product.id) : undefined
  const orderable = store.operating_status === 'OPEN'
  const [note, setNote] = useState<string | null>(null)

  function add() {
    const res = cart.add(
      { id: store.id, name: store.name },
      { productId: product.id, name: product.name, unit: product.unit, unitPrice: product.price, maxQty: stock.max },
    )
    setNote(res === 'limit' ? `Only ${stock.max} available` : null)
  }

  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-soft transition hover:shadow-lift ${stock.kind === 'out' ? 'opacity-75' : ''}`}>
      <div className={`relative grid aspect-[5/4] place-items-center ${TINTS[hash(product.category) % TINTS.length]}`} aria-hidden="true">
        <span className={`text-5xl transition-transform group-hover:scale-110 ${stock.kind === 'out' ? 'grayscale' : ''}`}>{categoryEmoji(product.category)}</span>
        {stock.kind === 'low' && <span className="absolute left-2 top-2 rounded-full bg-wheat-300 px-2 py-0.5 text-[11px] font-extrabold text-brand-700">{stock.label}</span>}
        {stock.kind === 'out' && <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-extrabold text-white">{stock.label}</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 min-h-10 text-[15px] font-bold leading-5">{product.name}</h3>
        <p className="mt-0.5 text-xs font-medium text-ink-faint">{product.unit}</p>
        {stock.kind === 'in' && <span className="sr-only">{stock.label}</span>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-lg font-extrabold num">{formatINR(product.price)}</span>
          {line ? (
            <QuantityStepper size="sm" quantity={line.quantity} max={line.maxQty} label={product.name} onChange={(q) => cart.setQty(product.id, q)} />
          ) : (
            <button
              onClick={add}
              disabled={stock.kind === 'out' || !orderable}
              aria-label={`Add ${product.name} to cart`}
              className="min-h-9 min-w-[4.5rem] rounded-xl border-2 border-cta-600 bg-cta-50 px-4 text-sm font-extrabold uppercase tracking-wide text-cta-700 transition hover:bg-cta-600 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-faint"
            >
              {stock.kind === 'out' ? 'Sold out' : 'Add'}
            </button>
          )}
        </div>
        {note && <p role="status" className="mt-1.5 text-xs font-semibold text-warn-600">{note}</p>}
      </div>
    </article>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="skeleton aspect-[5/4] w-full" />
      <div className="space-y-2 p-3"><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-8 w-full rounded-xl" /></div>
    </div>
  )
}
