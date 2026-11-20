import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllStores, useNearbyStores, useStoreOffer } from '../hooks/queries'
import { useGeolocation } from '../hooks/useGeolocation'
import { useAuth } from '../auth/AuthContext'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { ReadyBanner } from '../components/ReadyBanner'
import { SearchField, useSearchQuery } from '../components/SearchField'
import { StoreCard, StoreCardSkeleton } from '../components/StoreCard'
import { WalkBanner } from '../components/WalkBanner'

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

  const [q, setQ] = useSearchQuery()
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? stores.filter(({ store }) => `${store.name} ${store.address}`.toLowerCase().includes(t)) : stores
  }, [stores, q])

  const active = coords ? nearby : all
  const onSelect = useCallback((id: string) => navigate(`/store/${id}`), [navigate])
  const mapStores = useMemo(() => shown.map((s) => s.store), [shown])
  const waiting = geo.status === 'asking' || (coords && nearby.isPending)
  const first = user?.name?.split(' ')[0]
  // The nearest store decides whether "riders are busy, walk and save" is worth showing on the home screen.
  const nearestId = coords && stores[0] ? stores[0].store.id : null
  const offer = useStoreOffer(nearestId, coords)

  return (
    <div>
      <ReadyBanner name={first} />
      <WalkBanner offer={offer.data} className="mt-4" />

      <SearchField label="Search stores by name or area" className="mt-4 min-[960px]:hidden" />

      <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="How pickup works">
        {[
          ['Choose a store', 'Pick a dark store near you and add what you need.'],
          ['We pack it', 'The store gets your order and packs it in minutes.'],
          ['Show your code', 'Scan the QR or read out the OTP at the counter. No rider, no wait.'],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-card border border-line bg-surface p-4">
            <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-extrabold text-accent" aria-hidden="true">{i + 1}</span>
            <div><p className="font-bold">{title}</p><p className="mt-0.5 text-sm text-ink-soft">{body}</p></div>
          </li>
        ))}
      </ol>

      <div className="mb-4 mt-[34px] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-[-0.02em]">Stores near you</h2>
          {q.trim() && shown.length > 0 && <p className="mt-0.5 text-sm italic text-ink-faint">{shown.length} found for “{q.trim()}”</p>}
        </div>
        <div className="inline-flex rounded-full border border-line bg-surface p-1" role="tablist" aria-label="View">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-10 rounded-full px-5 text-sm font-bold transition-colors ${view === v ? 'bg-brand-600 text-white' : 'text-ink-soft hover:text-ink'}`}>
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
        <div className="grid gap-4 sm:grid-cols-2 min-[960px]:grid-cols-3" aria-busy="true" aria-label="Loading stores">
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
      ) : shown.length === 0 ? (
        <EmptyState title="No stores match" body={`Nothing matches “${q.trim()}”. Try an area like Bopal or Navrangpura.`} action={<Button variant="secondary" onClick={() => setQ('')}>Clear search</Button>} />
      ) : view === 'list' ? (
        <ul className="grid gap-4 sm:grid-cols-2 min-[960px]:grid-cols-3">
          {shown.map(({ store, distance }) => (
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
