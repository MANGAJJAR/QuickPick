import { useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAnalytics, useBoard, usePickupEnabled, useQueue, useRecentOrders, useStore, useStoreStatus } from '../hooks/queries'
import { dayKey, formatDuration } from '../lib/format'
import { Button, Card, ErrorState, InfoTip, PageHeader, Skeleton } from '../components/ui'
import type { StoreOperatingStatus } from '../api/types'
import { RiderSupplyCard } from '../components/RiderSupplyCard'

function Stat({ label, value, hint, tone = '', alert = false }: { label: string; value: ReactNode; hint?: string; tone?: string; alert?: boolean }) {
  // `alert` is the one thing the counter needs to act on now: it is the only loud card on the page.
  return (
    <Card className={`p-4 ${alert ? 'border-cta-600 bg-cta-600 text-white ' : tone}`}>
      <p className={`text-sm font-bold ${alert ? 'text-white/90' : 'text-ink-soft'}`}>{label}</p>
      <p className="mt-1 font-display text-5xl font-semibold tracking-tight num">{value}</p>
      {hint && <p className={`mt-1 text-xs ${alert ? 'text-white/85' : 'text-ink-faint'}`}>{hint}</p>}
    </Card>
  )
}

const STATUS_CHOICES: { value: StoreOperatingStatus; label: string; on: string }[] = [
  { value: 'OPEN', label: 'Open', on: 'bg-st-ready text-white' },
  { value: 'PAUSED', label: 'Pause', on: 'bg-wheat-500 text-ink' },
  { value: 'CLOSED', label: 'Closed', on: 'bg-st-cancelled text-white' },
]

export function OverviewPage() {
  const { role } = useAuth()
  const store = useStore()
  const board = useBoard()
  const recent = useRecentOrders()
  const queue = useQueue()
  const analytics = useAnalytics()
  const setStatus = useStoreStatus()
  const setPickup = usePickupEnabled()
  const isManager = role === 'STORE_MANAGER'
  useEffect(() => { document.title = 'Overview · QuickPick Store' }, [])

  // Today's figures are derived from the latest 100 orders: the API has no daily endpoint yet.
  const today = useMemo(() => {
    const key = dayKey(new Date().toISOString())
    const mine = (recent.data?.items ?? []).filter((o) => dayKey(o.created_at) === key)
    const completed = mine.filter((o) => o.order_status === 'COMPLETED').length
    const cancelled = mine.filter((o) => o.order_status === 'CANCELLED' || o.order_status === 'EXPIRED').length
    return { total: mine.length, completed, cancelled, rate: completed + cancelled > 0 ? Math.round((completed / (completed + cancelled)) * 100) : null }
  }, [recent.data])

  const s = store.data
  if (!s) return null
  const pending = board.data?.PLACED.length
  const inProgress = board.data ? board.data.ACCEPTED.length + board.data.PREPARING.length : undefined

  return (
    <div>
      <PageHeader title="Overview" sub={s.name} />

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="text-lg font-extrabold">Store status</h2>
            <p className="text-sm text-ink-soft">Customers can only order while the store is open.</p>
          </div>
          <div role="radiogroup" aria-label="Store status" className="flex overflow-hidden rounded-xl border-2 border-line">
            {STATUS_CHOICES.map((c) => {
              const active = s.operating_status === c.value
              return (
                <button
                  key={c.value}
                  role="radio"
                  aria-checked={active}
                  disabled={setStatus.isPending}
                  onClick={() => !active && setStatus.mutate(c.value)}
                  className={`min-h-16 min-w-28 px-5 text-xl font-extrabold disabled:opacity-60 ${active ? c.on : 'bg-surface text-ink-soft hover:bg-canvas'}`}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>
        {setStatus.isError && <p role="alert" className="mt-3 text-sm font-bold text-danger-600">{setStatus.error.message}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <h3 className="font-extrabold">Pickup orders</h3>
            <p className="text-sm text-ink-soft">{isManager ? 'Turn pickup off to stop QuickPick orders without closing the store.' : 'Only a store manager can change this.'}</p>
          </div>
          <Button
            variant={s.pickup_enabled ? 'primary' : 'secondary'}
            size="lg"
            role="switch"
            aria-checked={s.pickup_enabled}
            disabled={!isManager}
            loading={setPickup.isPending}
            onClick={() => setPickup.mutate(!s.pickup_enabled)}
          >
            {s.pickup_enabled ? 'Pickup enabled' : 'Pickup disabled'}
          </Button>
        </div>
        {setPickup.isError && <p role="alert" className="mt-3 text-sm font-bold text-danger-600">{setPickup.error.message}</p>}
      </Card>

      <RiderSupplyCard />

      {board.isError && !board.data ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="New orders waiting" value={pending ?? <Skeleton className="h-10 w-12" />} alert={!!pending} hint={pending ? 'Accept them on the Orders board' : 'Nothing waiting'} />
            <Stat label="In progress" value={inProgress ?? <Skeleton className="h-10 w-12" />} hint="Accepted + preparing" />
            <Stat label="Pickup queue" value={queue.data ? queue.data.length : <Skeleton className="h-10 w-12" />} hint="All open orders at the store" />
            <Stat label="Avg preparation time" value={analytics.data ? formatDuration(analytics.data.avg_preparation_seconds) : <Skeleton className="h-10 w-24" />} hint="Measured, all completed orders" />
          </div>

          <h2 className="mb-2 mt-6 flex items-center gap-1 text-sm font-extrabold uppercase tracking-wide text-ink-faint">
            Today
            <InfoTip text="The API has no daily summary yet, so these are counted in your browser from the latest 100 orders created today." />
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pickup orders today" value={recent.data ? today.total : <Skeleton className="h-10 w-12" />} />
            <Stat label="Completed" value={recent.data ? today.completed : <Skeleton className="h-10 w-12" />} />
            <Stat label="Cancelled / expired" value={recent.data ? today.cancelled : <Skeleton className="h-10 w-12" />} />
            <Stat label="Completion rate" value={recent.data ? (today.rate === null ? '—' : `${today.rate}%`) : <Skeleton className="h-10 w-16" />} hint="Completed ÷ (completed + cancelled)" />
          </div>
        </>
      )}
    </div>
  )
}
