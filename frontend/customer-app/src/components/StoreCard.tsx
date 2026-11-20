import { Link } from 'react-router-dom'
import type { Store } from '../api/types'
import { config } from '../config'
import { formatDistance } from '../lib/format'
import { Badge } from './ui'
import { PinIcon, StoreIcon } from './icons'

export function StoreCard({ store, distanceKm }: { store: Store; distanceKm?: number }) {
  const open = store.operating_status === 'OPEN'
  return (
    <Link to={`/store/${store.id}`} className="group block h-full" aria-label={`${store.name}, ${open ? 'open' : 'closed'}`}>
      <div className={`flex h-full flex-col rounded-card border border-line bg-surface p-4 transition-colors group-hover:border-brand-300 ${open ? '' : 'opacity-75'}`}>
        <div className="flex items-start gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-tile)] bg-tint-1 text-tintink-1" aria-hidden="true"><StoreIcon width={28} height={28} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold">{store.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-soft"><PinIcon width={14} height={14} />{store.address}</p>
          </div>
          {distanceKm !== undefined && <span className="num shrink-0 rounded-full bg-canvas px-3 py-1 text-sm font-bold">{formatDistance(distanceKm)}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={open ? 'good' : 'bad'}>{open ? 'Open now' : store.operating_status === 'PAUSED' ? 'Paused' : 'Closed'}</Badge>
          <Badge tone={store.pickup_enabled ? 'neutral' : 'bad'}>{store.pickup_enabled ? 'Pickup available' : 'Pickup unavailable'}</Badge>
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          {open ? <span className="text-sm italic text-ink-faint">Ready in ~{config.estimatedPrepMinutes} min (estimated)</span> : <span />}
          <span className="text-sm font-bold text-cta-ink">Shop →</span>
        </div>
      </div>
    </Link>
  )
}

export function StoreCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex gap-3"><div className="skeleton h-14 w-14 rounded-[var(--radius-tile)]" /><div className="flex-1 space-y-2 pt-1"><div className="skeleton h-5 w-2/3 rounded-lg" /><div className="skeleton h-4 w-1/2 rounded-lg" /></div></div>
      <div className="skeleton mt-4 h-6 w-1/3 rounded-full" />
    </div>
  )
}
