import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { BasketIcon } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand'

const VARIANTS: Record<Variant, string> = {
  // Terracotta coral is reserved for "do it" actions: Add, Checkout, Place order.
  primary: 'bg-cta-600 text-white  hover:brightness-90 active:scale-[0.98] disabled:bg-cta-600/45',
  brand: 'bg-brand-600 text-white  hover:brightness-90 active:scale-[0.98] disabled:bg-brand-600/45',
  secondary: 'border border-line bg-surface text-ink hover:border-brand-200 hover:bg-brand-50 disabled:text-ink-faint',
  ghost: 'text-accent hover:bg-brand-50 disabled:text-ink-faint',
  danger: 'border border-danger-600/30 bg-surface text-danger-600 hover:bg-danger-50 disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'md' | 'sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading, size = 'md', className = '', disabled, children, ...rest },
  ref,
) {
  const sizing = size === 'md' ? 'min-h-12 px-6 text-base' : 'min-h-10 px-4 text-sm'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card border border-line bg-surface  ${className}`} {...rest} />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'wheat'
const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft',
  good: 'bg-brand-100 text-accent',
  warn: 'bg-wheat-100 text-warn-600',
  bad: 'bg-danger-50 text-danger-600',
  wheat: 'bg-wheat-300 text-brand-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const api = error instanceof ApiError ? error : null
  const heading = title ?? (api?.isNetwork ? "You're offline" : 'Something went wrong')
  const message = api?.message ?? (error instanceof Error ? error.message : 'Please try again.')
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-danger-50 text-xl font-extrabold text-danger-600" aria-hidden="true">!</div>
      <h2 className="text-lg font-extrabold">{heading}</h2>
      <p className="max-w-sm text-sm text-ink-soft">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </Card>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-10 text-center">
      <div className="mb-1 grid h-16 w-16 place-items-center rounded-[var(--radius-tile)] bg-tint-3 text-tintink-3" aria-hidden="true"><BasketIcon width={30} height={30} /></div>
      <h2 className="text-lg font-extrabold">{title}</h2>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
  )
}

/** A link styled as a button (avoids invalid <button> inside <a>). */
export function ButtonLink({
  to, variant = 'primary', size = 'md', className = '', children, ...rest
}: { to: string; variant?: Variant; size?: 'md' | 'sm'; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const sizing = size === 'md' ? 'min-h-12 px-6 text-base' : 'min-h-10 px-4 text-sm'
  return (
    <Link to={to} className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition ${sizing} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  )
}
