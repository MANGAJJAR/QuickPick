import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas disabled:text-ink-faint',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-ink-faint',
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
  const sizing = size === 'md' ? 'min-h-12 px-5 text-base' : 'min-h-10 px-4 text-sm'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
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
  return <div className={`rounded-card border border-line bg-surface ${className}`} {...rest} />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad'
const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft',
  good: 'bg-brand-100 text-brand-900',
  warn: 'bg-warn-50 text-warn-600',
  bad: 'bg-danger-50 text-danger-600',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const api = error instanceof ApiError ? error : null
  const heading = title ?? (api?.isNetwork ? "You're offline" : 'Something went wrong')
  const message = api?.message ?? (error instanceof Error ? error.message : 'Please try again.')
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-danger-50 text-danger-600" aria-hidden="true">!</div>
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="max-w-sm text-sm text-ink-soft">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </Card>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
  )
}

/** A link styled as a button (avoids invalid <button> inside <a>). */
export function ButtonLink({
  to, variant = 'primary', size = 'md', className = '', children, ...rest
}: { to: string; variant?: Variant; size?: 'md' | 'sm'; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const sizing = size === 'md' ? 'min-h-12 px-5 text-base' : 'min-h-10 px-4 text-sm'
  return (
    <Link to={to} className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ${sizing} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  )
}
