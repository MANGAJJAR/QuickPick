import { useState } from 'react'
import type { ProductView, Store } from '../api/types'
import { useCart } from '../cart/CartContext'
import { config } from '../config'
import { formatINR, stockState } from '../lib/format'
import { QuantityStepper } from './QuantityStepper'
import { Badge, Button, Card } from './ui'

const TINTS = ['bg-brand-100 text-brand-900', 'bg-amber-100 text-amber-900', 'bg-sky-100 text-sky-900', 'bg-rose-100 text-rose-900', 'bg-violet-100 text-violet-900']

function tint(category: string): string {
  let h = 0
  for (const c of category) h = (h * 31 + c.charCodeAt(0)) % TINTS.length
  return TINTS[h]!
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
    <Card className={`flex gap-3 p-3 ${stock.kind === 'out' ? 'opacity-70' : ''}`}>
      <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-xl text-xl font-extrabold ${tint(product.category)}`} aria-hidden="true">
        {product.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-[15px] font-semibold">{product.name}</h3>
        <p className="text-xs text-ink-faint">{product.unit}</p>
        <div className="mt-1"><Badge tone={stock.kind === 'in' ? 'good' : stock.kind === 'low' ? 'warn' : 'bad'}>{stock.label}</Badge></div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold num">{formatINR(product.price)}</span>
          {line ? (
            <QuantityStepper quantity={line.quantity} max={line.maxQty} label={product.name} onChange={(q) => cart.setQty(product.id, q)} />
          ) : (
            <Button size="sm" variant="ghost" className="min-w-20 border border-brand-600" onClick={add} disabled={stock.kind === 'out' || !orderable} aria-label={`Add ${product.name} to cart`}>
              {stock.kind === 'out' ? 'Sold out' : 'Add'}
            </Button>
          )}
        </div>
        {note && <p role="status" className="mt-1 text-xs font-medium text-warn-600">{note}</p>}
      </div>
    </Card>
  )
}

export function ProductCardSkeleton() {
  return (
    <Card className="flex gap-3 p-3">
      <div className="skeleton h-20 w-20 rounded-xl" />
      <div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-6 w-1/2 rounded" /></div>
    </Card>
  )
}
