import type { WalkOffer } from '../api/types'
import { BikeIcon, WalkIcon } from './icons'

/**
 * "Riders are busy. Walk 3 min and save ₹40": surge pricing in reverse. Everything shown comes from the server:
 * the headline only exists when the customer is within walking distance AND riders are scarce.
 * When riders are busy but the customer is far or location is off, it just says how long delivery is taking.
 */
export function WalkBanner({ offer, className = '' }: { offer: WalkOffer | undefined; className?: string }) {
  if (!offer || !offer.surge_active) return null
  if (offer.eligible && offer.headline) {
    return (
      <div role="status" className={`flex items-center gap-3 rounded-[var(--radius-card)] border border-cta-600/40 bg-cta-50 p-4 ${className}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-tile)] bg-cta-600 text-white" aria-hidden="true"><WalkIcon width={22} height={22} /></span>
        <div className="min-w-0">
          <p className="text-base font-extrabold text-cta-ink">{offer.headline}</p>
          <p className="text-sm text-ink-soft">
            {offer.reasons.join(' · ')}. Delivery is taking about <span className="num font-semibold">{offer.delivery_eta_minutes} min</span> right now. Pickup is {offer.distance_m} m away.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div role="status" className={`flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 ${className}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-tile)] bg-tint-3 text-tintink-3" aria-hidden="true"><BikeIcon width={22} height={22} /></span>
      <p className="text-sm text-ink-soft">
        <span className="font-bold text-ink">Riders are busy.</span> {offer.reasons.join(' · ')}. Delivery is taking about <span className="num font-semibold">{offer.delivery_eta_minutes} min</span>. Allow location to see if pickup saves you more.
      </p>
    </div>
  )
}
