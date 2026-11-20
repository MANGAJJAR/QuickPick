import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { InfoIcon } from './icons'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/45',
  secondary: 'border-2 border-line bg-surface text-ink hover:bg-canvas disabled:text-ink-faint',
  danger: 'border-2 border-danger-600/40 bg-surface text-danger-600 hover:bg-danger-50 disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-canvas disabled:text-ink-faint',
  dark: 'bg-ink text-white hover:bg-rail-soft disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'lg' | 'md' | 'sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading, size = 'md', className = '', disabled, children, ...rest },
  ref,
) {
  const sizing = size === 'lg' ? 'min-h-14 px-6 text-lg' : size === 'md' ? 'min-h-12 px-5 text-base' : 'min-h-10 px-3.5 text-sm'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`} {...rest} />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'
const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft ring-line',
  good: 'bg-brand-100 text-brand-900 ring-brand-500/40',
  warn: 'bg-warn-50 text-warn-600 ring-warn-600/30',
  bad: 'bg-danger-50 text-danger-600 ring-danger-600/30',
  info: 'bg-st-accepted-bg text-st-accepted ring-st-accepted/30',
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const api = error instanceof ApiError ? error : null
  const heading = title ?? (api?.isNetwork ? 'No connection' : 'Something went wrong')
  const message = api?.message ?? (error instanceof Error ? error.message : 'Please try again.')
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <h2 className="text-lg font-bold">{heading}</h2>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </Card>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center">
      <h2 className="text-lg font-bold text-ink-soft">{title}</h2>
      {body && <p className="max-w-md text-sm text-ink-faint">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Info icon with an accessible tooltip (hover, focus and tap). */
export function InfoTip({ text }: { text: string }) {
  const id = useId()
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-describedby={id} aria-label="More information" className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-ink">
        <InfoIcon size={16} />
      </button>
      <span id={id} role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-medium leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  )
}
