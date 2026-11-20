import { useEffect, useState } from 'react'
import type { CheckoutPreview, Coords, DeliveryAddress, OrderType } from '../api/types'
import { useReadyBy } from '../lib/eta'
import { formatINR } from '../lib/format'
import { BikeIcon, StoreIcon } from './icons'

const KEY = 'qp-address-v1'

/** The last delivery address the customer typed, kept on this device only. */
export function useSavedAddress(): [DeliveryAddress, (next: DeliveryAddress) => void] {
  const [address, setAddress] = useState<DeliveryAddress>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as DeliveryAddress) : { line: '', instructions: '' }
    } catch {
      return { line: '', instructions: '' }
    }
  })
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(address)) } catch { /* storage can be blocked */ }
  }, [address])
  return [address, setAddress]
}

function Option({ checked, onSelect, icon, title, sub, price, note, tag }: {
  checked: boolean; onSelect(): void; icon: React.ReactNode; title: string; sub: string; price: string; note: string; tag?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-[var(--radius-card)] border-2 p-4 text-left transition-colors ${checked ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface hover:border-brand-300'}`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-tile)] ${checked ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-soft'}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold">{title}</span>
          {tag && <span className="rounded-full bg-wheat-300 px-2 py-0.5 text-xs font-bold text-brand-700">{tag}</span>}
        </span>
        <span className="block text-sm italic text-ink-faint">{sub}</span>
        <span className="mt-1 block text-sm text-ink-soft">{note}</span>
      </span>
      <span className="text-right">
        <span className="num block text-lg font-extrabold">{price}</span>
        <span className="text-xs italic text-ink-faint">you pay</span>
      </span>
    </button>
  )
}

/** Delivery or pickup, side by side, each with the server's price. The customer decides. */
export function FulfilmentChoice({ preview, value, onChange, coords }: { preview: CheckoutPreview; value: OrderType; onChange(next: OrderType): void; coords: Coords | null }) {
  const ready = useReadyBy()
  if (!preview.delivery) return null // an older backend: pickup only
  const d = preview.delivery
  const walk = preview.offer?.eligible ? `Walk ${preview.offer.walk_minutes} min · riders are busy` : undefined
  return (
    <div role="radiogroup" aria-label="How do you want your order?" className="grid gap-3 min-[720px]:grid-cols-2">
      <Option
        checked={value === 'PICKUP'}
        onSelect={() => onChange('PICKUP')}
        icon={<StoreIcon width={22} height={22} />}
        title="Pickup"
        tag={walk}
        sub={`Ready by ${ready} (estimated)`}
        note={`You save ${formatINR(preview.pricing.you_save)} vs delivery${coords ? '' : '. Allow location to see walk-in savings.'}`}
        price={formatINR(preview.pricing.total_amount)}
      />
      <Option
        checked={value === 'DELIVERY'}
        onSelect={() => onChange('DELIVERY')}
        icon={<BikeIcon width={22} height={22} />}
        title="Delivery"
        sub={`About ${preview.delivery_eta_minutes ?? '—'} min (estimate)`}
        note={Number(d.delivery_fee) === 0 ? 'Free delivery' : `Includes ${formatINR(d.delivery_fee)} delivery fee`}
        price={formatINR(d.total_amount)}
      />
    </div>
  )
}

/** Where to deliver. A typed address is enough; the store sees exactly what is typed here. */
export function AddressForm({ address, onChange }: { address: DeliveryAddress; onChange(next: DeliveryAddress): void }) {
  const field = 'mt-1 block min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-base outline-none focus:border-brand-500'
  const short = address.line.trim().length > 0 && address.line.trim().length < 5
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h3 className="text-base font-extrabold">Delivery address</h3>
      <label className="block text-sm font-bold">Address
        <input className={field} value={address.line} onChange={(e) => onChange({ ...address, line: e.target.value })} autoComplete="street-address" placeholder="Flat, building, street, area" aria-invalid={short} />
      </label>
      {short && <p role="alert" className="text-sm font-semibold text-danger-600">Enter a full address so the rider can find you.</p>}
      <label className="block text-sm font-bold">Instructions for the rider (optional)
        <input className={field} value={address.instructions ?? ''} onChange={(e) => onChange({ ...address, instructions: e.target.value })} maxLength={200} placeholder="Ring the bell, leave at door…" />
      </label>
    </div>
  )
}
