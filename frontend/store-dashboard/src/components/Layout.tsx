import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useApi } from '../api/context'
import { useAuth } from '../auth/AuthContext'
import { useBoard, useLowStock, useNotifications, useStore } from '../hooks/queries'
import { useOnline } from '../hooks/utility'
import { setSoundEnabled, soundEnabled } from '../lib/sound'
import { BellIcon, BoardIcon, BoxIcon, ChartIcon, GridIcon, QueueIcon, ScanIcon } from './icons'

function Count({ n, tone = 'bg-wheat-300 text-brand-700' }: { n: number; tone?: string }) {
  if (n <= 0) return null
  return <span className={`ml-auto grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-extrabold num ${tone}`} aria-label={`${n} pending`}>{n > 99 ? '99+' : n}</span>
}

export function Layout() {
  const api = useApi()
  const { user, role, signOut } = useAuth()
  const store = useStore()
  const online = useOnline()
  const board = useBoard()
  const low = useLowStock()
  const notifications = useNotifications()
  const [sound, setSound] = useState(soundEnabled)

  const newOrders = board.data?.PLACED.length ?? 0
  const lowCount = low.data?.length ?? 0
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0

  const nav = [
    { to: '/', label: 'Overview', icon: GridIcon, end: true, count: 0 },
    { to: '/orders', label: 'Orders', icon: BoardIcon, end: false, count: newOrders },
    { to: '/queue', label: 'Pickup queue', icon: QueueIcon, end: false, count: 0 },
    { to: '/inventory', label: 'Inventory', icon: BoxIcon, end: false, count: lowCount },
    { to: '/analytics', label: 'Analytics', icon: ChartIcon, end: false, count: 0 },
    { to: '/notifications', label: 'Alerts', icon: BellIcon, end: false, count: unread },
  ]
  const open = store.data?.operating_status === 'OPEN'

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-rail text-white md:w-60" aria-label="Sidebar">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-wheat-300 text-brand-600"><BoxIcon /></span>
          <div className="hidden min-w-0 md:block">
            <p className="truncate font-display text-lg font-semibold leading-tight">Quick<span className="text-wheat-300">Pick</span> Store</p>
            <p className="truncate text-xs text-white/60">{store.data?.name}</p>
          </div>
        </div>

        <Link to="/counter" className="mx-3 mb-3 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-cta-600 px-3 font-extrabold text-white shadow-sm transition hover:bg-cta-700" aria-label="Open pickup counter mode">
          <ScanIcon size={24} /><span className="hidden md:inline">Pickup counter</span>
        </Link>

        <nav aria-label="Main" className="flex-1 space-y-1 px-2">
          {nav.map(({ to, label, icon: I, end, count }) => (
            <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-bold ${isActive ? 'bg-wheat-300 text-brand-600' : 'text-white/75 hover:bg-white/10'}`}>
              <I size={22} /><span className="hidden md:inline">{label}</span>
              <span className="hidden md:ml-auto md:block"><Count n={count} tone={to === '/inventory' ? 'bg-danger-600 text-white' : undefined} /></span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/10 p-3 text-xs text-white/70">
          <p className="hidden truncate md:block">{user?.name ?? user?.email}<br /><span className="text-white/50">{role === 'STORE_MANAGER' ? 'Manager' : 'Staff'}</span></p>
          <button onClick={() => void signOut()} className="min-h-10 w-full rounded-lg bg-white/10 px-2 font-bold hover:bg-white/20">Sign out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {api.isMock && <div className="bg-wheat-100 px-4 py-1.5 text-center text-xs font-bold text-st-placed">Mock mode: demo data, not connected to the QuickPick backend</div>}
        {!online && <div role="status" className="bg-ink px-4 py-2 text-center text-sm font-bold text-white">Offline. Orders are not updating; reconnect before handing over.</div>}

        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/90 px-5 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold ${open ? 'bg-st-ready-bg text-st-ready' : 'bg-st-cancelled-bg text-st-cancelled'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${open ? 'bg-st-ready' : 'bg-st-cancelled'}`} aria-hidden="true" />
              {store.data?.operating_status === 'OPEN' ? 'Store open' : store.data?.operating_status === 'PAUSED' ? 'Store paused' : 'Store closed'}
            </span>
            {store.data && !store.data.pickup_enabled && <span className="rounded-lg bg-warn-50 px-3 py-1.5 text-sm font-bold text-warn-600">Pickup disabled</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { const next = !sound; setSound(next); setSoundEnabled(next) }}
              aria-pressed={sound}
              className="min-h-10 rounded-lg border-2 border-line px-3 text-sm font-bold"
            >
              New-order sound: {sound ? 'On' : 'Off'}
            </button>
            <Link to="/notifications" className="relative grid h-10 w-10 place-items-center rounded-lg border-2 border-line" aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}>
              <BellIcon />
              {unread > 0 && <span data-testid="header-unread" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger-600 px-1 text-[11px] font-extrabold text-white num">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          </div>
        </header>

        <main className="flex-1 p-5"><Outlet /></main>
      </div>
    </div>
  )
}
