import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllStores, useNearbyStores } from '../hooks/queries'
import { useGeolocation } from '../hooks/useGeolocation'
import { useAuth } from '../auth/AuthContext'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { StoreCard, StoreCardSkeleton } from '../components/StoreCard'

const StoreMap = lazy(() => import('../components/StoreMap'))

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const geo = useGeolocation()
  const [view, setView] = useState<'list' | 'map'>('list')
  useEffect(() => { document.title = 'Stores near you · QuickPick' }, [])

  const coords = geo.coords
  const nearby = useNearbyStores(coords)
  // Without location we show every pickup store (no distance) instead of an empty screen.
  const all = useAllStores(geo.status === 'denied' || geo.status === 'unavailable')

  const stores = useMemo(() => {
    if (coords && nearby.data) return nearby.data.map((s) => ({ store: s.store, distance: s.distance_km as number | undefined }))
    return (all.data?.items ?? []).map((store) => ({ store, distance: undefined as number | undefined }))
  }, [coords, nearby.data, all.data])

  const active = coords ? nearby : all
  const onSelect = useCallback((id: string) => navigate(`/store/${id}`), [navigate])
  const mapStores = useMemo(() => stores.map((s) => s.store), [stores])
  const waiting = geo.status === 'asking' || (coords && nearby.isPending)

  const first = user?.name?.split(' ')[0]
  return (
    <div>
      <section className="banner-texture relative mb-6 overflow-hidden rounded-[1.75rem] bg-brand-600 px-6 py-7 text-white md:px-10 md:py-10">
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-wheat-300 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-brand-700">Self-pickup</span>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            {first ? `${first}, skip the rider.` : 'Skip the rider.'}<br /><span className="text-wheat-300">Pick it up fresh.</span>
          </h1>
          <p className="mt-3 max-w-md text-brand-100">Order from a dark store near you, collect it in minutes and save on delivery. Your discount is shown at checkout.</p>
        </div>
        <span className="pointer-events-none absolute -right-4 -top-2 select-none text-[8rem] leading-none opacity-20 md:right-8 md:text-[11rem]" aria-hidden="true">🛍️</span>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Stores near you</h2>
        <div className="inline-flex rounded-full bg-surface p-1 shadow-soft ring-1 ring-line" role="tablist" aria-label="View">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-10 rounded-full px-5 text-sm font-bold transition ${view === v ? 'bg-brand-600 text-white' : 'text-ink-soft hover:text-ink'}`}>
              {v === 'list' ? 'List' : 'Map'}
            </button>
          ))}
        </div>
      </div>

      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-wheat-500/40 bg-wheat-100 p-4 text-sm font-medium text-warn-600" role="status">
          <span>{geo.status === 'denied' ? 'Location is blocked, so we can’t sort by distance.' : 'We couldn’t get your location.'} Showing all pickup stores.</span>
          <Button size="sm" variant="secondary" onClick={geo.request}>Use my location</Button>
        </div>
      )}

      {waiting ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading stores">
          {[0, 1, 2].map((i) => <StoreCardSkeleton key={i} />)}
        </div>
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : stores.length === 0 ? (
        <EmptyState
          title="No pickup stores nearby"
          body={coords ? 'No participating stores within 15 km yet. Try again later or from a different location.' : 'No participating stores are available right now.'}
          action={coords ? <Button variant="secondary" onClick={() => void nearby.refetch()}>Refresh</Button> : undefined}
        />
      ) : view === 'list' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map(({ store, distance }) => (
            <li key={store.id}><StoreCard store={store} distanceKm={distance} /></li>
          ))}
        </ul>
      ) : (
        <Suspense fallback={<Skeleton className="h-[380px] w-full" />}>
          <StoreMap user={coords} stores={mapStores} onSelect={onSelect} />
        </Suspense>
      )}
    </div>
  )
}
