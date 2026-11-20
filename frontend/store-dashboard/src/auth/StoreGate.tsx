import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../api/client'
import { Button, Card, Skeleton } from '../components/ui'
import { useStore } from '../hooks/queries'
import { isStoreRole, useAuth } from './AuthContext'

export function NotAuthorized({ reason }: { reason?: string }) {
  const { user, role, signOut } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-lg p-8 text-center" role="alert">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-2xl font-extrabold text-danger-600" aria-hidden="true">!</div>
        <h1 className="text-2xl font-extrabold">Not authorized for a store</h1>
        <p className="mt-2 text-ink-soft">
          {user?.email ? <b>{user.email}</b> : 'This account'} doesn’t have a store staff role{role ? ` (current role: ${role})` : ''}, so it can’t use the store dashboard.
        </p>
        {reason && <p className="mt-2 text-sm text-ink-faint">{reason}</p>}
        <p className="mt-3 text-sm text-ink-soft">Ask your store manager or QuickPick admin to assign you as <b>STORE_STAFF</b> or <b>STORE_MANAGER</b> for your store, then sign in again.</p>
        <Button className="mt-5" variant="dark" onClick={() => void signOut()}>Sign out</Button>
      </Card>
    </div>
  )
}

/** Signed-in + store role + the backend agrees (GET /store/me). The backend is the authority on store scope. */
export function StoreGate({ children }: { children: ReactNode }) {
  const { user, role, loading } = useAuth()
  const location = useLocation()
  const eligible = !!user && isStoreRole(role)
  const store = useStore(eligible)

  if (loading) return <div role="status" aria-live="polite" className="grid min-h-screen place-items-center text-ink-soft">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!eligible) return <NotAuthorized />
  if (store.isPending) return <div className="mx-auto max-w-3xl space-y-3 p-8" aria-busy="true" aria-label="Loading store"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>
  if (store.isError) {
    if (store.error instanceof ApiError && store.error.status === 403) return <NotAuthorized reason={store.error.message} />
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md p-6 text-center" role="alert">
          <h1 className="text-xl font-extrabold">Can’t load your store</h1>
          <p className="mt-1 text-sm text-ink-soft">{store.error instanceof Error ? store.error.message : 'Please try again.'}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void store.refetch()}>Try again</Button>
        </Card>
      </div>
    )
  }
  return <>{children}</>
}
