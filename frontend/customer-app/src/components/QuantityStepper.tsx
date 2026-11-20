import { MinusIcon, PlusIcon } from './icons'

interface Props {
  quantity: number
  max: number
  label: string
  onChange(next: number): void
}

/** Cart quantity control. `label` is the product name, used for screen-reader labels. */
export function QuantityStepper({ quantity, max, label, onChange }: Props) {
  const btn = 'grid h-10 w-10 place-items-center rounded-lg text-white disabled:opacity-40'
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-brand-600 p-1" role="group" aria-label={`Quantity of ${label}`}>
      <button className={btn} onClick={() => onChange(quantity - 1)} aria-label={`Remove one ${label}`}><MinusIcon width={18} height={18} /></button>
      <span key={quantity} className="anim-pop min-w-7 text-center text-base font-bold text-white num" aria-live="polite">{quantity}</span>
      <button className={btn} onClick={() => onChange(quantity + 1)} disabled={quantity >= max} aria-label={`Add one more ${label}`}><PlusIcon width={18} height={18} /></button>
    </div>
  )
}
