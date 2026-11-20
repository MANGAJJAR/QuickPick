import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApi } from '../api/context'
import { useAuth } from '../auth/AuthContext'
import { useCart } from '../cart/CartContext'
import { AlertToasts } from '../features/alerts/AlertToasts'
import { AssistantFab } from '../features/assistant/AssistantFab'
import { useNotifications } from '../hooks/queries'
import { useTheme } from '../lib/theme'
import { CartBar } from './CartBar'
import { Logo } from './Logo'
import { BellIcon, CartIcon, HomeIcon, ReceiptIcon, StoreIcon, SunMoonIcon } from './icons'
import { SearchField } from './SearchField'
import { ToastProvider } from './Toast'

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

function Count({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="absolute -right-2.5 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-cta-600 px-1 text-[11px] font-extrabold text-white num" aria-hidden="true">
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

const THEME_LABEL = { auto: 'Theme: follows your device', light: 'Theme: light', dark: 'Theme: dark' } as const

export function Layout() {
  const online = useOnline()
  const { pathname } = useLocation()
  const { cart, count } = useCart()
  const { signOut, user } = useAuth()
  const api = useApi()
  const theme = useTheme()
  const notifications = useNotifications()
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0
  const badge = (to: string) => (to === '/cart' ? count : to === '/notifications' ? unread : 0)
  const searchable = pathname === '/' || pathname.startsWith('/store/')

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        {api.isMock && (
          <div className="bg-wheat-300 px-4 py-1.5 text-center text-xs font-bold text-brand-700">
            Mock mode: demo data, not connected to the QuickPick backend
          </div>
        )}
        {!online && (
          <div role="status" className="bg-bar px-4 py-2 text-center text-sm font-semibold text-white">
            You’re offline. Your cart is kept and changes will sync when you reconnect.
          </div>
        )}

        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-5 min-[960px]:gap-5 min-[960px]:px-8">
            <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="QuickPick home">
              <Logo />
              <span className="hidden text-xl font-extrabold tracking-[-0.03em] sm:inline">QuickPick</span>
            </Link>

            <Link to="/" className="flex min-w-0 items-center gap-2 rounded-xl py-1 pr-2 hover:bg-canvas" aria-label="Change store">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-100 text-accent"><StoreIcon width={18} height={18} /></span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-xs italic text-ink-faint">Picking up from</span>
                <span className="block truncate text-sm font-bold">{cart.store?.name ?? 'Stores near you'} <span aria-hidden="true">⌄</span></span>
              </span>
            </Link>

            {searchable && <div className="mx-auto hidden w-full max-w-xl flex-1 min-[960px]:block"><SearchField label="Search" /></div>}

            <div className="ml-auto flex items-center gap-1.5">
              <nav aria-label="Main" className="hidden items-center gap-1 min-[960px]:flex">
                {NAV.filter((n) => n.to !== '/cart').map(({ to, label, icon: I, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-brand-100 text-accent' : 'text-ink-soft hover:bg-canvas'}`}>
                    <span className="relative"><I width={20} height={20} /><Count n={badge(to)} /></span>
                    {label}
                  </NavLink>
                ))}
                <NavLink to="/cart" className={({ isActive }) => `flex h-10 items-center gap-2 rounded-xl bg-cta-600 px-4 text-sm font-bold text-white hover:brightness-90 ${isActive ? 'brightness-90' : ''}`}>
                  <CartIcon width={20} height={20} />Cart{count > 0 && <span className="num rounded-full bg-white/25 px-2 text-xs">{count}</span>}
                </NavLink>
              </nav>
              <button onClick={theme.cycle} className="grid h-10 w-10 place-items-center rounded-full border border-line hover:bg-canvas" aria-label={`${THEME_LABEL[theme.choice]}. Switch theme`} title={THEME_LABEL[theme.choice]}>
                <SunMoonIcon width={20} height={20} />
              </button>
              <button onClick={() => void signOut()} className="h-10 whitespace-nowrap rounded-full border border-line px-3 text-sm font-semibold text-ink-soft hover:bg-canvas min-[960px]:px-4" aria-label={`Sign out ${user?.email ?? ''}`}>
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-40 pt-5 min-[960px]:px-8 min-[960px]:pb-12">
          <div key={pathname} className="anim-rise"><Outlet /></div>
        </main>

        <CartBar />

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] min-[960px]:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {NAV.map(({ to, label, icon: I, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[13px] ${isActive ? 'font-extrabold text-accent' : 'font-medium text-ink-faint'}`}>
                  <span className="relative"><I /><Count n={badge(to)} /></span>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <AlertToasts />
        <AssistantFab />
      </div>
    </ToastProvider>
  )
}
