import { Link } from 'react-router-dom'
import type { Store } from '../api/types'
import { config } from '../config'
import { formatDistance } from '../lib/format'
import { Badge } from './ui'
import { PinIcon } from './icons'

export function StoreCard({ store, distanceKm }: { store: Store; distanceKm?: number }) {
  const open = store.operating_status === 'OPEN'
  return (
    <Link to={`/store/${store.id}`} className="group block h-full" aria-label={`${store.name}, ${open ? 'open' : 'closed'}`}>
      <div className={`flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-soft transition group-hover:-translate-y-0.5 group-hover:shadow-lift ${open ? '' : 'opacity-80'}`}>
        <div className="banner-texture relative flex h-20 items-end justify-between bg-brand-600 px-4 pb-3">
          <span className="grid h-11 w-11 -mb-8 place-items-center rounded-2xl border-4 border-surface bg-wheat-300 text-xl shadow-sm" aria-hidden="true">🏪</span>
          {distanceKm !== undefined && <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-extrabold text-white backdrop-blur num">{formatDistance(distanceKm)}</span>}
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-6">
          <h3 className="truncate text-lg font-extrabold">{store.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-soft"><PinIcon width={14} height={14} />{store.address}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={open ? 'good' : 'bad'}>{open ? 'Open now' : store.operating_status === 'PAUSED' ? 'Paused' : 'Closed'}</Badge>
            <Badge tone={store.pickup_enabled ? 'wheat' : 'neutral'}>{store.pickup_enabled ? 'Pickup available' : 'Pickup unavailable'}</Badge>
          </div>
          <div className="mt-auto flex items-center justify-between pt-4">
            {open ? <span className="text-xs font-semibold text-ink-faint">Ready in ~{config.estimatedPrepMinutes} min (estimated)</span> : <span />}
            <span className="text-sm font-extrabold text-cta-700 transition group-hover:translate-x-0.5">Shop →</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function StoreCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="skeleton h-20 w-full rounded-none" />
      <div className="space-y-2 p-4 pt-6"><div className="skeleton h-5 w-2/3 rounded-lg" /><div className="skeleton h-4 w-1/2 rounded-lg" /><div className="skeleton mt-3 h-6 w-1/3 rounded-full" /></div>
    </div>
  )
}
