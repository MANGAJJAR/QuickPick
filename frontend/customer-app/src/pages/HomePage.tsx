import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllStores, useNearbyStores } from '../hooks/queries'
import { useGeolocation } from '../hooks/useGeolocation'
import { useAuth } from '../auth/AuthContext'
import { Button, EmptyState, ErrorState, PageTitle, Skeleton } from '../components/ui'
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

  return (
    <div>
      <PageTitle sub={user?.name ? `Hi ${user.name.split(' ')[0]}, pick up and skip the delivery fee.` : 'Pick up and skip the delivery fee.'}>
        Stores near you
      </PageTitle>

      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-warn-600/20 bg-warn-50 p-4 text-sm text-warn-600" role="status">
          <span>{geo.status === 'denied' ? 'Location is blocked, so we can’t sort by distance.' : 'We couldn’t get your location.'} Showing all pickup stores.</span>
          <Button size="sm" variant="secondary" onClick={geo.request}>Use my location</Button>
        </div>
      )}

      <div className="mb-4 inline-flex rounded-xl bg-surface p-1 ring-1 ring-line" role="tablist" aria-label="View">
        {(['list', 'map'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`min-h-10 rounded-lg px-5 text-sm font-semibold ${view === v ? 'bg-brand-600 text-white' : 'text-ink-soft'}`}>
            {v === 'list' ? 'List' : 'Map'}
          </button>
        ))}
      </div>

      {waiting ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading stores">
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
        <ul className="grid gap-3 md:grid-cols-2">
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
