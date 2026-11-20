import { useId, useState } from 'react'

interface Props {
  label: string
  value: string
  onChange(next: string): void
  autoComplete: string
  inputClassName: string
  labelClassName: string
  minLength?: number
}

/** Password input with a show/hide toggle. The toggle is a sibling of the input (not inside the label) so the input keeps the plain label. */
export function PasswordField({ label, value, onChange, autoComplete, inputClassName, labelClassName, minLength }: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`${inputClassName} pr-20`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm font-bold text-brand-500 hover:bg-brand-50"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
