import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCart } from '../cart/CartContext'
import { useNotifications } from '../hooks/queries'
import { AssistantFab } from '../features/assistant/AssistantFab'
import { BellIcon, CartIcon, HomeIcon, PinIcon, ReceiptIcon } from './icons'
import { useApi } from '../api/context'

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="absolute -right-2 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white num" aria-hidden="true">
      {n > 9 ? '9+' : n}
    </span>
  )
}

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/orders', label: 'Orders', icon: ReceiptIcon, end: false },
  { to: '/notifications', label: 'Alerts', icon: BellIcon, end: false },
  { to: '/cart', label: 'Cart', icon: CartIcon, end: false },
] as const

export function Layout() {
  const online = useOnline()
  const { count } = useCart()
  const { signOut, user } = useAuth()
  const api = useApi()
  const notifications = useNotifications()
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0
  const badge = (to: string) => (to === '/cart' ? count : to === '/notifications' ? unread : 0)

  return (
    <div className="flex min-h-screen flex-col">
      {api.isMock && (
        <div className="bg-warn-50 px-4 py-1.5 text-center text-xs font-medium text-warn-600">
          Mock mode: demo data, not connected to the QuickPick backend
        </div>
      )}
      {!online && (
        <div role="status" className="bg-ink px-4 py-2 text-center text-sm font-medium text-white">
          You're offline. Showing the last data we loaded.
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-brand-700">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><PinIcon width={18} height={18} /></span>
            QuickPick
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: I, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-canvas'}`}>
                <span className="relative"><I width={20} height={20} /><Badge n={badge(to)} /></span>
                {label}
              </NavLink>
            ))}
          </nav>
          <button onClick={() => void signOut()} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-canvas" aria-label={`Sign out ${user?.email ?? ''}`}>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-10">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ to, label, icon: I, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive ? 'text-brand-700' : 'text-ink-faint'}`}>
                <span className="relative"><I /><Badge n={badge(to)} /></span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AssistantFab />
    </div>
  )
}
