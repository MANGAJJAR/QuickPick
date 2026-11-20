import { BackspaceIcon } from './icons'

interface Props {
  value: string
  maxLength?: number
  disabled?: boolean
  onChange(next: string): void
  onSubmit(): void
}

/** Large on-screen numeric keypad for the OTP fallback (also accepts the physical keyboard). */
export function Keypad({ value, maxLength = 6, disabled, onChange, onSubmit }: Props) {
  const key = 'h-16 rounded-xl border-2 border-line bg-surface text-3xl font-extrabold num hover:bg-canvas active:bg-line disabled:opacity-50'
  const press = (d: string) => value.length < maxLength && onChange(value + d)

  return (
    <div
      onKeyDown={(e) => {
        if (disabled) return
        if (/^\d$/.test(e.key)) press(e.key)
        else if (e.key === 'Backspace') onChange(value.slice(0, -1))
        else if (e.key === 'Enter' && value.length >= 4) onSubmit()
      }}
      className="mx-auto w-full max-w-xs"
    >
      <div className="mb-3 flex justify-center gap-2" aria-live="polite" aria-label={`Code entered: ${value.split('').join(' ') || 'none'}`}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <span key={i} className={`grid h-14 w-11 place-items-center rounded-lg border-2 text-3xl font-extrabold num ${i === value.length ? 'border-ink' : 'border-line'}`}>
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} disabled={disabled} onClick={() => press(d)} aria-label={`Digit ${d}`}>{d}</button>
        ))}
        <button type="button" className={`${key} text-base`} disabled={disabled || !value} onClick={() => onChange('')} aria-label="Clear code">Clear</button>
        <button type="button" className={key} disabled={disabled} onClick={() => press('0')} aria-label="Digit 0">0</button>
        <button type="button" className={`${key} grid place-items-center`} disabled={disabled || !value} onClick={() => onChange(value.slice(0, -1))} aria-label="Delete last digit"><BackspaceIcon size={28} /></button>
      </div>
    </div>
  )
}
