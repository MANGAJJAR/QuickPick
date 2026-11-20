import { Link } from 'react-router-dom'
import type { Store } from '../api/types'
import { config } from '../config'
import { formatDistance } from '../lib/format'
import { Badge, Card } from './ui'
import { PinIcon } from './icons'

export function StoreCard({ store, distanceKm }: { store: Store; distanceKm?: number }) {
  const open = store.operating_status === 'OPEN'
  return (
    <Link to={`/store/${store.id}`} className="block" aria-label={`${store.name}, ${open ? 'open' : 'closed'}`}>
      <Card className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{store.name}</h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-soft"><PinIcon width={14} height={14} />{store.address}</p>
          </div>
          {distanceKm !== undefined && <span className="shrink-0 rounded-lg bg-canvas px-2.5 py-1 text-sm font-bold num">{formatDistance(distanceKm)}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={open ? 'good' : 'bad'}>{open ? 'Open now' : store.operating_status === 'PAUSED' ? 'Paused' : 'Closed'}</Badge>
          <Badge tone={store.pickup_enabled ? 'good' : 'neutral'}>{store.pickup_enabled ? 'Pickup available' : 'Pickup unavailable'}</Badge>
          {open && <span className="text-xs text-ink-faint">Ready in ~{config.estimatedPrepMinutes} min (estimated)</span>}
        </div>
      </Card>
    </Link>
  )
}

export function StoreCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="skeleton h-5 w-2/3 rounded-lg" />
      <div className="skeleton mt-2 h-4 w-1/2 rounded-lg" />
      <div className="skeleton mt-4 h-6 w-1/3 rounded-full" />
    </Card>
  )
}
