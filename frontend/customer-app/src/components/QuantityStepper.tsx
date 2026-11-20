import { MinusIcon, PlusIcon } from './icons'

interface Props {
  quantity: number
  max: number
  label: string
  onChange(next: number): void
  /** `sm` fits inside product tiles. */
  size?: 'md' | 'sm'
}

/** Cart quantity control. `label` is the product name, used for screen-reader labels. */
export function QuantityStepper({ quantity, max, label, onChange, size = 'md' }: Props) {
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10'
  const btn = `grid ${dim} place-items-center rounded-lg text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-40`
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-cta-600 p-0.5" role="group" aria-label={`Quantity of ${label}`}>
      <button className={btn} onClick={() => onChange(quantity - 1)} aria-label={`Remove one ${label}`}><MinusIcon width={16} height={16} /></button>
      <span key={quantity} className="anim-pop min-w-6 text-center text-base font-extrabold text-white num" aria-live="polite">{quantity}</span>
      <button className={btn} onClick={() => onChange(quantity + 1)} disabled={quantity >= max} aria-label={`Add one more ${label}`}><PlusIcon width={16} height={16} /></button>
    </div>
  )
}
