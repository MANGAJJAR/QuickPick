import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { BackIcon, PinIcon } from '../components/icons'
import { CartPanel } from '../components/CartPanel'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import { SearchField, useSearchQuery } from '../components/SearchField'
import { Button, EmptyState, ErrorState, ButtonLink } from '../components/ui'
import { config } from '../config'
import { useProducts, useStore, useStoreOffer } from '../hooks/queries'
import { useGeolocation } from '../hooks/useGeolocation'
import { WalkBanner } from '../components/WalkBanner'

type Sort = 'popular' | 'low' | 'high'

export function StorePage() {
  const { storeId = '' } = useParams()
  const store = useStore(storeId)
  const products = useProducts(storeId)
  const geo = useGeolocation()
  const offer = useStoreOffer(storeId || null, geo.coords)
  const [query, setQuery] = useSearchQuery()
  const [category, setCategory] = useState<string>('All')
  const [sort, setSort] = useState<Sort>('popular')
  useEffect(() => { document.title = `${store.data?.name ?? 'Store'} · QuickPick` }, [store.data?.name])

  const all = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data])
  const categories = useMemo(() => ['All', ...Array.from(new Set(all.map((v) => v.product.category))).sort()], [all])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = all.filter((v) => (category === 'All' || v.product.category === category) && (!q || v.product.name.toLowerCase().includes(q)))
    // Ordering only: prices are compared for sorting and never added up on the client.
    if (sort === 'low') return [...list].sort((a, b) => Number(a.product.price) - Number(b.product.price))
    if (sort === 'high') return [...list].sort((a, b) => Number(b.product.price) - Number(a.product.price))
    return list
  }, [all, query, category, sort])

  if (store.isError) {
    const notFound = store.error instanceof ApiError && store.error.status === 404
    return notFound
      ? <EmptyState title="Store not found" body="This store doesn’t exist or isn’t offering pickup." action={<ButtonLink to="/" variant="secondary">Back to stores</ButtonLink>} />
      : <ErrorState error={store.error} onRetry={() => void store.refetch()} />
  }

  const open = store.data?.operating_status === 'OPEN'

  return (
    <div className="min-[960px]:grid min-[960px]:grid-cols-[minmax(0,1fr)_340px] min-[960px]:items-start min-[960px]:gap-8">
      <div className="min-w-0">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><BackIcon width={18} height={18} />All stores</Link>

      {store.isPending ? (
        <div className="mb-4 space-y-2"><div className="skeleton h-8 w-1/2 rounded" /><div className="skeleton h-4 w-1/3 rounded" /></div>
      ) : (
        <header className="mb-5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{store.data.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft"><PinIcon width={14} height={14} />{store.data.address}</p>
          <p className="mt-2 text-sm italic text-ink-faint">{open ? `Ready in ~${config.estimatedPrepMinutes} min (estimated)` : 'Closed right now'}</p>
          {!open && <p role="status" className="mt-3 rounded-2xl bg-bar p-4 text-sm font-semibold text-white">This store isn’t taking orders right now. You can browse, but ordering is disabled.</p>}
        </header>
      )}

      <WalkBanner offer={offer.data} className="mb-4" />

      <SearchField label="Search products" className="mb-3 min-[960px]:hidden" />

          <div className="sticky top-16 z-20 -mx-5 flex items-center gap-3 border-b border-line bg-canvas px-5 py-3 min-[960px]:mx-0 min-[960px]:px-0">
            <div className="hide-scrollbar flex flex-1 gap-2 overflow-x-auto" role="tablist" aria-label="Aisles">
              {categories.map((c) => (
                <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${category === c ? 'bg-brand-600 text-white' : 'border border-line bg-surface text-ink-soft hover:text-ink'}`}>{c}</button>
              ))}
            </div>
            <label className="shrink-0">
              <span className="sr-only">Sort products</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold">
                <option value="popular">Popular</option>
                <option value="low">Price low to high</option>
                <option value="high">Price high to low</option>
              </select>
            </label>
          </div>

          {query.trim() && visible.length > 0 && <p className="mt-3 text-sm italic text-ink-faint">{visible.length} found for “{query.trim()}”</p>}

          <div className="mt-4">
            {products.isPending ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1200px]:grid-cols-4" aria-busy="true" aria-label="Loading products">{[0, 1, 2, 3, 4, 5].map((i) => <ProductCardSkeleton key={i} />)}</div>
            ) : products.isError ? (
              <ErrorState error={products.error} onRetry={() => void products.refetch()} />
            ) : all.length === 0 ? (
              <EmptyState title="Nothing in stock yet" body="This store hasn’t added products." />
            ) : visible.length === 0 ? (
              <EmptyState title="No matches" body={`Nothing matches “${query}”${category !== 'All' ? ` in ${category}` : ''}.`} action={<Button variant="secondary" onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</Button>} />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1200px]:grid-cols-4">
                {store.data && visible.map((v) => <li key={v.product.id}><ProductCard view={v} store={store.data} /></li>)}
              </ul>
            )}

            {products.hasNextPage && (
              <div className="mt-4"><Button variant="secondary" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>Load more</Button></div>
            )}
          </div>
        </div>

        {/* Web: the order panel stays in view. Mobile uses the floating cart bar + bottom sheet instead. */}
        <aside aria-label="Your order" className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-card border border-line bg-surface min-[960px]:flex">
          <CartPanel />
        </aside>
    </div>
  )
}
