import { useRef } from 'react'
import { cleanCode } from '../lib/code'
import { BackspaceIcon } from './icons'

interface Props {
  value: string
  maxLength?: number
  disabled?: boolean
  onChange(next: string): void
  onSubmit(): void
}

/** Large on-screen numeric keypad plus a real input, so the code can be typed, pasted or tapped. */
export function Keypad({ value, maxLength = 6, disabled, onChange, onSubmit }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const key = 'h-16 rounded-xl border-2 border-line bg-surface text-3xl font-extrabold num hover:bg-canvas active:bg-line disabled:opacity-50'
  const press = (d: string) => value.length < maxLength && onChange(value + d)

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="relative mb-3 rounded-xl focus-within:ring-2 focus-within:ring-cta-600 focus-within:ring-offset-2">
        <div className="flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: maxLength }).map((_, i) => (
            <span key={i} className={`grid h-14 w-11 place-items-center rounded-lg border-2 text-3xl font-extrabold num ${i === value.length ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface'}`}>
              {value[i] ?? ''}
            </span>
          ))}
        </div>
        {/* The real input sits over the boxes: clicking focuses it, typing and pasting work natively. */}
        <input
          ref={input}
          value={value}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={maxLength * 2}
          aria-label={`Pickup code, ${maxLength} digits`}
          onChange={(e) => onChange(cleanCode(e.target.value, maxLength))}
          onPaste={(e) => {
            e.preventDefault()
            onChange(cleanCode(e.clipboardData.getData('text'), maxLength))
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.length >= 4 && !disabled) onSubmit() }}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 focus:opacity-0"
        />
      </div>
      <p className="mb-3 text-center text-xs font-medium text-ink-faint">Type, paste or tap the code</p>
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
