import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BoxIcon } from '../components/icons'
import { Button, Card } from '../components/ui'

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect.'
  if (code.includes('invalid-email')) return 'Enter a valid email address.'
  if (code.includes('user-disabled')) return 'This account has been disabled. Contact your manager.'
  if (code.includes('network')) return 'Can’t reach the sign-in service. Check the connection.'
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.'
  return err instanceof Error ? err.message : 'Something went wrong. Try again.'
}

export function LoginPage() {
  const { user, isMock, configError, signIn, mockSignIn } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { document.title = 'Sign in · QuickPick Store' }, [])

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1 block min-h-12 w-full rounded-lg border-2 border-line bg-surface px-4 text-base outline-none focus:border-ink'

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-rail text-brand-500"><BoxIcon size={26} /></span>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">QuickPick Store</h1>
            <p className="text-sm text-ink-soft">Dark store operations</p>
          </div>
        </div>
        <Card className="p-6">
          {isMock ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-soft">Mock mode is on. Pick a demo account:</p>
              <Button className="w-full" onClick={() => mockSignIn?.('manager')}>Sign in as store manager</Button>
              <Button className="w-full" variant="secondary" onClick={() => mockSignIn?.('staff')}>Sign in as counter staff</Button>
              <Button className="w-full" variant="ghost" onClick={() => mockSignIn?.('customer')}>Sign in as a customer (shows “not authorized”)</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {configError && <p role="alert" className="rounded-lg bg-warn-50 p-3 text-sm font-semibold text-warn-600">{configError}</p>}
              <label className="block text-sm font-bold">Work email
                <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
              </label>
              <label className="block text-sm font-bold">Password
                <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              {error && <p role="alert" className="text-sm font-bold text-danger-600">{error}</p>}
              <Button type="submit" className="w-full" loading={busy} disabled={!!configError}>Sign in</Button>
              <p className="text-center text-xs text-ink-faint">Store accounts are created by your manager or a QuickPick admin.</p>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
