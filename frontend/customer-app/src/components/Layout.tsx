import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
    <span className="absolute -right-2.5 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-cta-600 px-1 text-[11px] font-extrabold text-white ring-2 ring-surface num" aria-hidden="true">
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
  const { pathname } = useLocation()
  const { count } = useCart()
  const { signOut, user } = useAuth()
  const api = useApi()
  const notifications = useNotifications()
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0
  const badge = (to: string) => (to === '/cart' ? count : to === '/notifications' ? unread : 0)

  return (
    <div className="flex min-h-dvh flex-col">
      {api.isMock && (
        <div className="bg-wheat-300 px-4 py-1.5 text-center text-xs font-bold text-brand-700">
          Mock mode: demo data, not connected to the QuickPick backend
        </div>
      )}
      {!online && (
        <div role="status" className="bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
          You're offline. Showing the last data we loaded.
        </div>
      )}

      <header className="sticky top-0 z-30 bg-brand-600 text-white shadow-[0_6px_20px_-10px_rgb(14_38_27/0.6)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="QuickPick home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-wheat-300 text-brand-600"><PinIcon width={20} height={20} /></span>
            <span className="font-display text-2xl font-semibold tracking-tight">Quick<span className="text-wheat-300">Pick</span></span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: I, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${isActive ? 'bg-wheat-300 text-brand-600' : 'text-brand-100 hover:bg-white/10'}`}>
                <span className="relative"><I width={20} height={20} /><Badge n={badge(to)} /></span>
                {label}
              </NavLink>
            ))}
          </nav>
          <button onClick={() => void signOut()} className="rounded-full px-3 py-2 text-sm font-bold text-brand-100 transition hover:bg-white/10" aria-label={`Sign out ${user?.email ?? ''}`}>
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:pb-12">
        <div key={pathname} className="anim-rise"><Outlet /></div>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-14px_rgb(24_31_26/0.25)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ to, label, icon: I, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${isActive ? 'text-brand-600' : 'text-ink-faint'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`relative grid h-8 w-14 place-items-center rounded-full transition ${isActive ? 'bg-wheat-300' : ''}`}><I /><Badge n={badge(to)} /></span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <AssistantFab />
    </div>
  )
}
