import type { OrderType, Pricing } from '../api/types'
import { formatINR } from '../lib/format'
import { ReceiptIcon } from './icons'

const n = (v: string | undefined | null): number => Number(v ?? 0)

/** A charge a pickup order is spared: the delivery price struck through, then FREE (the delivery bill is the comparison). */
function Spared({ label, amount }: { label: string; amount: string | undefined }) {
  if (n(amount) <= 0) return null
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="num flex items-center gap-2">
        <s className="text-ink-faint" aria-label={`was ${formatINR(amount)}`}>{formatINR(amount)}</s>
        <span className="font-extrabold text-success">FREE</span>
      </dd>
    </div>
  )
}

function Charge({ label, amount, show }: { label: string; amount: string | undefined; show: boolean }) {
  if (!show) return null
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="num font-semibold">{formatINR(amount)}</dd>
    </div>
  )
}

/**
 * The bill, laid out like a delivery app's bill counter. Every figure comes from the server's pricing:
 * - DELIVERY pays item total + delivery fee + handling fee (+ late-night fee).
 * - PICKUP pays none of those fees: they are shown struck through and FREE, and add up in the savings card.
 * `compareAt` is what the same cart costs delivered (shown struck through next to the pickup total).
 */
export function BillSummary({ pricing, mode, compareAt, compact = false }: { pricing: Pricing; mode: OrderType; compareAt?: string; compact?: boolean }) {
  const pickup = mode === 'PICKUP'
  const saving = n(pricing.you_save)
  return (
    <section aria-label="Bill summary" className={compact ? '' : 'rounded-card border border-line bg-surface'}>
      {!compact && (
        <header className="flex items-center gap-3 p-4 pb-2">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-tile)] bg-canvas text-ink-soft" aria-hidden="true"><ReceiptIcon width={20} height={20} /></span>
          <h3 className="text-lg font-extrabold">Bill summary</h3>
        </header>
      )}
      <dl className={compact ? '' : 'px-4 pb-1'}>
        <div className="flex items-center justify-between py-1.5 text-sm">
          <dt className="text-ink-soft">Item total</dt>
          <dd className="num font-semibold">{formatINR(pricing.subtotal)}</dd>
        </div>
        {pickup ? (
          <>
            <Spared label="Delivery fee" amount={pricing.waived_delivery_fee} />
            <Spared label="Handling fee" amount={pricing.waived_handling_fee} />
            <Spared label="Late night fee" amount={pricing.waived_night_fee} />
            {n(pricing.pickup_discount) > 0 && (
              <div className="flex items-center justify-between py-1.5 text-sm">
                <dt className="text-ink-soft">Pickup discount</dt>
                <dd className="num font-semibold text-success">−{formatINR(pricing.pickup_discount)}</dd>
              </div>
            )}
          </>
        ) : (
          <>
            <Charge label="Delivery fee" amount={pricing.delivery_fee} show={n(pricing.delivery_fee) > 0} />
            <Charge label="Handling fee" amount={pricing.handling_fee} show={n(pricing.handling_fee) > 0} />
            <Charge label="Late night fee" amount={pricing.night_fee} show={n(pricing.night_fee) > 0} />
          </>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-line py-3">
          <dt className="text-base font-extrabold">To pay</dt>
          <dd className="num flex items-center gap-2 text-lg font-extrabold">
            {pickup && compareAt && n(compareAt) > n(pricing.total_amount) && <s className="text-sm font-semibold text-ink-faint" aria-label={`delivery would cost ${formatINR(compareAt)}`}>{formatINR(compareAt)}</s>}
            {formatINR(pricing.total_amount)}
          </dd>
        </div>
      </dl>
      {pickup && saving > 0 && (
        <div role="status" className={`flex items-center justify-between rounded-[var(--radius-tile)] bg-brand-50 px-4 py-3 ${compact ? '' : 'm-4 mt-1'}`}>
          <span className="font-extrabold">Savings on this order</span>
          <span className="num rounded-lg bg-success px-3 py-1 text-lg font-extrabold text-surface" data-testid="you-save">{formatINR(pricing.you_save)}</span>
        </div>
      )}
    </section>
  )
}
