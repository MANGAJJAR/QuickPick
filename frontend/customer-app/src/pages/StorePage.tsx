import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useCart } from '../cart/CartContext'
import { BackIcon, CartIcon, SearchIcon } from '../components/icons'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import { Badge, Button, EmptyState, ErrorState, ButtonLink } from '../components/ui'
import { config } from '../config'
import { useProducts, useStore } from '../hooks/queries'
import { PinIcon } from '../components/icons'

export function StorePage() {
  const { storeId = '' } = useParams()
  const store = useStore(storeId)
  const products = useProducts(storeId)
  const cart = useCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('All')
  useEffect(() => { document.title = `${store.data?.name ?? 'Store'} · QuickPick` }, [store.data?.name])

  const all = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data])
  const categories = useMemo(() => ['All', ...Array.from(new Set(all.map((v) => v.product.category))).sort()], [all])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((v) => (category === 'All' || v.product.category === category) && (!q || v.product.name.toLowerCase().includes(q)))
  }, [all, query, category])

  if (store.isError) {
    const notFound = store.error instanceof ApiError && store.error.status === 404
    return notFound
      ? <EmptyState title="Store not found" body="This store doesn’t exist or isn’t offering pickup." action={<ButtonLink to="/" variant="secondary">Back to stores</ButtonLink>} />
      : <ErrorState error={store.error} onRetry={() => void store.refetch()} />
  }

  const open = store.data?.operating_status === 'OPEN'
  const inThisCart = cart.cart.store?.id === storeId ? cart.count : 0

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft"><BackIcon width={18} height={18} />All stores</Link>

      {store.isPending ? (
        <div className="mb-4 space-y-2"><div className="skeleton h-7 w-1/2 rounded" /><div className="skeleton h-4 w-1/3 rounded" /></div>
      ) : (
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">{store.data.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft"><PinIcon width={14} height={14} />{store.data.address}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={open ? 'good' : 'bad'}>{open ? 'Open now' : 'Closed'}</Badge>
            {open && <span className="text-xs text-ink-faint">Ready in ~{config.estimatedPrepMinutes} min (estimated)</span>}
          </div>
          {!open && <p role="status" className="mt-3 rounded-xl bg-danger-50 p-3 text-sm font-medium text-danger-600">This store isn’t taking orders right now. You can browse, but ordering is disabled.</p>}
        </div>
      )}

      <div className="sticky top-14 z-20 -mx-4 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width={18} height={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search milk, bread, eggs…" className="min-h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base outline-none focus:border-brand-500" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categories">
          {categories.map((c) => (
            <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${category === c ? 'bg-brand-600 text-white' : 'bg-surface text-ink-soft ring-1 ring-line'}`}>{c}</button>
          ))}
        </div>
      </div>

      {products.isPending ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading products">{[0, 1, 2, 3].map((i) => <ProductCardSkeleton key={i} />)}</div>
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState title="Nothing in stock yet" body="This store hasn’t added products." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" body={`Nothing matches “${query}”${category !== 'All' ? ` in ${category}` : ''}.`} action={<Button variant="secondary" onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</Button>} />
      ) : (
        <ul className="mt-2 grid gap-3 md:grid-cols-2">
          {store.data && visible.map((v) => <li key={v.product.id}><ProductCard view={v} store={store.data} /></li>)}
        </ul>
      )}

      {products.hasNextPage && (
        <div className="mt-4 text-center"><Button variant="secondary" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>Load more</Button></div>
      )}

      {inThisCart > 0 && (
        <Link to="/cart" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-brand-700 px-5 py-3.5 font-semibold text-white shadow-lg md:bottom-6" aria-label={`View cart, ${inThisCart} items`}>
          <span className="flex items-center gap-2"><CartIcon />{inThisCart} item{inThisCart > 1 ? 's' : ''}</span>
          <span>View cart →</span>
        </Link>
      )}
    </div>
  )
}
