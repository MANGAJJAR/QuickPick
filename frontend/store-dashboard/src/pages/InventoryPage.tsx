import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { InventoryRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useInventory, useInventoryMutations, useLowStock } from '../hooks/queries'
import { formatTime, humanizeProductId } from '../lib/format'
import { validateQuantity } from '../lib/stock'
import { Button, Card, EmptyState, ErrorState, InfoTip, PageHeader, Pill, Skeleton } from '../components/ui'

type Tab = 'all' | 'low'

function StockRow({ row, canRemove }: { row: InventoryRow; canRemove: boolean }) {
  const { setStock, remove } = useInventoryMutations()
  const [draft, setDraft] = useState(String(row.available_quantity))
  useEffect(() => { setDraft(String(row.available_quantity)) }, [row.available_quantity])
  const check = validateQuantity(draft)
  const changed = check.ok && check.value !== row.available_quantity
  const lowStock = row.pickable_quantity <= 5
  const error = (setStock.error ?? remove.error) as Error | null

  return (
    <tr className={lowStock ? 'bg-danger-50/60' : ''}>
      <td className="p-3">
        <p className="text-base font-extrabold">{humanizeProductId(row.product_id)}</p>
        <p className="font-mono text-xs text-ink-faint">{row.product_id}</p>
      </td>
      <td className="p-3 text-right text-xl font-extrabold num" aria-label={`Available ${row.available_quantity}`}>{row.available_quantity}</td>
      <td className="p-3 text-right text-xl font-bold text-st-preparing num" aria-label={`Reserved ${row.reserved_quantity}`}>{row.reserved_quantity}</td>
      <td className="p-3 text-right">
        <span className="text-xl font-extrabold num" aria-label={`Pickable ${row.pickable_quantity}`}>{row.pickable_quantity}</span>
        {lowStock && <span className="ml-2 align-middle"><Pill tone="bad">Low</Pill></span>}
      </td>
      <td className="p-3">
        <form
          className="flex items-start gap-2"
          onSubmit={(e: FormEvent) => { e.preventDefault(); if (check.ok && changed && !setStock.isPending) setStock.mutate({ productId: row.product_id, quantity: check.value }) }}
        >
          <div>
            <label className="sr-only" htmlFor={`qty-${row.product_id}`}>Set available quantity for {row.product_id}</label>
            <input
              id={`qty-${row.product_id}`}
              inputMode="numeric"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setStock.reset() }}
              aria-invalid={!check.ok}
              className={`min-h-11 w-24 rounded-lg border-2 px-2 text-right text-lg font-bold num outline-none focus:border-ink ${check.ok ? 'border-line' : 'border-danger-600'}`}
            />
            {!check.ok && <p role="alert" className="mt-1 text-xs font-bold text-danger-600">{check.reason}</p>}
          </div>
          <Button type="submit" size="sm" className="min-h-11" disabled={!check.ok || !changed} loading={setStock.isPending}>Save</Button>
          {canRemove && (
            <Button
              type="button" size="sm" variant="danger" className="min-h-11" loading={remove.isPending}
              onClick={() => { if (window.confirm(`Remove ${row.product_id} from this store's inventory?`)) remove.mutate(row.product_id) }}
            >
              Remove
            </Button>
          )}
        </form>
        {error && <p role="alert" className="mt-1 max-w-xs text-xs font-bold text-danger-600">{error.message}</p>}
      </td>
      <td className="p-3 text-xs text-ink-faint">{formatTime(row.updated_at)}</td>
    </tr>
  )
}

function AddItemDialog({ onClose }: { onClose(): void }) {
  const { add } = useInventoryMutations()
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('0')
  const check = validateQuantity(qty)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <form
        role="dialog" aria-modal="true" aria-labelledby="add-title"
        className="anim-pop w-full max-w-md space-y-3 rounded-xl bg-surface p-5 shadow-2xl"
        onSubmit={(e) => { e.preventDefault(); if (check.ok && productId.trim()) add.mutate({ productId: productId.trim(), quantity: check.value }, { onSuccess: onClose }) }}
      >
        <h2 id="add-title" className="text-xl font-extrabold">Add item to this store</h2>
        <p className="text-sm text-ink-soft">The API has no store-facing product catalogue yet, so enter the catalogue product ID exactly (for example <code>milk</code>).</p>
        <label className="block text-sm font-bold">Product ID
          <input autoFocus value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 block min-h-12 w-full rounded-lg border-2 border-line px-3 font-mono outline-none focus:border-ink" required />
        </label>
        <label className="block text-sm font-bold">Starting quantity
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!check.ok} className={`mt-1 block min-h-12 w-full rounded-lg border-2 px-3 num outline-none focus:border-ink ${check.ok ? 'border-line' : 'border-danger-600'}`} />
          {!check.ok && <span role="alert" className="text-xs font-bold text-danger-600">{check.reason}</span>}
        </label>
        {add.isError && <p role="alert" className="text-sm font-bold text-danger-600">{add.error.message}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" loading={add.isPending} disabled={!check.ok || !productId.trim()}>Add item</Button>
          <Button type="button" variant="secondary" disabled={add.isPending} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

export function InventoryPage() {
  const { role } = useAuth()
  const all = useInventory()
  const low = useLowStock()
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  useEffect(() => { document.title = 'Inventory · QuickPick Store' }, [])

  const source = tab === 'all' ? all : low
  const rows: InventoryRow[] = useMemo(() => {
    const list = tab === 'all' ? all.data?.items ?? [] : low.data ?? []
    const q = query.trim().toLowerCase()
    return q ? list.filter((r) => r.product_id.toLowerCase().includes(q)) : list
  }, [tab, all.data, low.data, query])

  return (
    <div>
      <PageHeader title="Inventory" sub="Available = on the shelf · Reserved = promised to open orders (changes only through orders) · Pickable = available − reserved" actions={<Button onClick={() => setAdding(true)}>Add item</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Inventory view" className="flex rounded-lg bg-canvas p-1 ring-1 ring-line">
          <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} className={`min-h-11 rounded-md px-5 font-bold ${tab === 'all' ? 'bg-ink text-white' : 'text-ink-soft'}`}>All items</button>
          <button role="tab" aria-selected={tab === 'low'} onClick={() => setTab('low')} className={`flex min-h-11 items-center gap-2 rounded-md px-5 font-bold ${tab === 'low' ? 'bg-ink text-white' : 'text-ink-soft'}`}>
            Low stock
            <span data-testid="low-stock-badge" className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-extrabold num ${(low.data?.length ?? 0) > 0 ? 'bg-danger-600 text-white' : 'bg-line text-ink-soft'}`}>{low.data?.length ?? '–'}</span>
          </button>
        </div>
        <label className="min-w-64 flex-1">
          <span className="sr-only">Search products</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product" className="min-h-12 w-full rounded-lg border-2 border-line bg-surface px-4 text-base outline-none focus:border-ink" />
        </label>
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="cat">Category</label>
          <select id="cat" disabled className="min-h-12 rounded-lg border-2 border-line bg-canvas px-3 text-ink-faint"><option>All categories</option></select>
          <InfoTip text="Category filter is unavailable: the inventory API returns product IDs only, with no names or categories for store staff." />
        </div>
      </div>

      {source.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : source.isError && !source.data ? (
        <ErrorState error={source.error} onRetry={() => void source.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={tab === 'low' && !query ? 'Nothing is running low' : 'No items found'} body={query ? `Nothing matches “${query}”.` : tab === 'low' ? 'Items at or below the low-stock level appear here.' : 'Add items to start stocking this store.'} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-canvas text-xs font-extrabold uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-3">Product</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">Reserved</th><th className="p-3 text-right">Pickable</th>
                <th className="p-3">Adjust available stock</th><th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => <StockRow key={r.product_id} row={r} canRemove={role === 'STORE_MANAGER'} />)}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-ink-faint">“Remove” (managers only) takes an item out of this store’s inventory; the API has no separate deactivate, and it refuses while units are reserved.</p>

      {adding && <AddItemDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
