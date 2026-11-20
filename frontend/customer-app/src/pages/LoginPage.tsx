import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'
import { PasswordField } from '../components/PasswordField'
import { PinIcon } from '../components/icons'
import { useApi } from '../api/context'
import { useMe } from '../hooks/queries'

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect.'
  if (code.includes('email-already-in-use')) return 'An account with this email already exists. Try signing in.'
  if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.'
  if (code.includes('invalid-email')) return 'Enter a valid email address.'
  if (code.includes('network')) return "Can't reach the sign-in service. Check your connection."
  if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.'
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export function LoginPage() {
  const { user, loading, isMock, configError, signIn, signUp } = useAuth()
  const api = useApi()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After first login, GET /customers/me initialises the profile server-side.
  const me = useMe(!!user)
  useEffect(() => { document.title = 'Sign in · QuickPick' }, [])

  if (user && me.isSuccess) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp(name.trim(), email, password)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const initialising = !!user && !me.isError
  const field = 'mt-1 block min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-base outline-none focus:border-brand-500 focus:bg-white'

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="banner-texture mb-6 overflow-hidden rounded-[1.75rem] bg-brand-600 px-6 py-8 text-center text-white">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-wheat-300 text-brand-600"><PinIcon width={28} height={28} /></span>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">Quick<span className="text-wheat-300">Pick</span></h1>
        <p className="mt-2 text-brand-100">Skip the delivery fee. Pick up from a dark store near you.</p>
      </div>

      <Card className="p-5">
        {configError && !isMock && <p role="alert" className="mb-4 rounded-xl bg-warn-50 p-3 text-sm text-warn-600">{configError}</p>}

        {isMock ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">Mock mode is on. No account needed.</p>
            <Button onClick={() => void signIn('', '')}>Continue as demo customer</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div role="tablist" aria-label="Sign in or create account" className="grid grid-cols-2 rounded-xl bg-wheat-100 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null) }} className={`min-h-10 rounded-lg text-sm font-bold ${mode === m ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-soft'}`}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
            {mode === 'signup' && (
              <label className="text-sm font-semibold">Name
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="text-sm font-semibold">Email
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <PasswordField label="Password" labelClassName="text-sm font-semibold" inputClassName={field} value={password} onChange={setPassword} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} />
            {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}
            <Button type="submit" loading={busy || (initialising && !loading)} disabled={!!configError}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        )}

        {user && me.isError && (
          <p role="alert" className="mt-4 text-sm text-danger-600">
            Signed in, but we could not load your profile ({me.error instanceof Error ? me.error.message : 'error'}).{' '}
            <button className="font-semibold underline" onClick={() => void me.refetch()}>Retry</button>
          </p>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-ink-faint">{api.isMock ? 'Demo data' : 'Secured by Firebase Authentication'}</p>
    </div>
  )
}
