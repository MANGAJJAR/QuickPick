import type { ArrivalStatus } from '../api/types'
import { PinIcon, WalkIcon } from './icons'

/** "Here now" / "5 min away": what the customer told us. Pairs an icon with text so it never relies on colour alone. */
export function ArrivalBadge({ status, eta, className = '' }: { status: ArrivalStatus | null | undefined; eta: number | null | undefined; className?: string }) {
  if (!status) return null
  const here = status === 'ARRIVED'
  return (
    <span
      data-arrival={status}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-extrabold ${here ? 'bg-cta-600 text-white' : 'bg-wheat-300 text-brand-700'} ${className}`}
    >
      {here ? <PinIcon size={14} /> : <WalkIcon size={14} />}
      {here ? 'Customer is here' : `${eta ?? '?'} min away`}
    </span>
  )
}
