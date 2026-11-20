import { useEffect, useMemo, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsOverview, Order } from '../api/types'
import { useAnalytics, useRecentOrders } from '../hooks/queries'
import { dayKey, formatDuration, formatINR, shortId } from '../lib/format'
import { Card, ErrorState, InfoTip, PageHeader, Skeleton } from '../components/ui'

export interface DayPoint { day: string; completed: number; cancelled: number }

/** Groups the latest orders by local day for the last 7 days. Pure, so it is unit tested. */
export function buildDailySeries(orders: Order[], days = 7, now = new Date()): DayPoint[] {
  const out: DayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.toISOString())
    const mine = orders.filter((o) => dayKey(o.created_at) === key)
    out.push({
      day: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      completed: mine.filter((o) => o.order_status === 'COMPLETED').length,
      cancelled: mine.filter((o) => o.order_status === 'CANCELLED' || o.order_status === 'EXPIRED').length,
    })
  }
  return out
}

/** Preparation minutes (preparing -> ready) for the most recent completed orders. */
export function buildPrepSeries(orders: Order[], limit = 12): { id: string; minutes: number }[] {
  return orders
    .filter((o) => o.order_status === 'COMPLETED' && o.preparing_at && o.ready_at)
    .slice(0, limit)
    .reverse()
    .map((o) => ({ id: `#${shortId(o.id).slice(0, 4)}`, minutes: Math.round(((Date.parse(o.ready_at!) - Date.parse(o.preparing_at!)) / 60000) * 10) / 10 }))
}

function Measured({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-bold text-ink-soft">{label}</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight num">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </Card>
  )
}

function Illustrative({ data }: { data: AnalyticsOverview }) {
  return (
    <Card className="border-2 border-dashed border-amber-500 bg-amber-50 p-4" data-testid="illustrative-card">
      <div className="flex items-center gap-1">
        <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-amber-900">Estimated, based on assumptions</span>
        <InfoTip text="Illustrative only: completed pickups multiplied by an assumed rider cost per delivery. It is not measured and not verified savings." />
      </div>
      <p className="mt-2 text-sm font-bold text-amber-900">Estimated delivery cost saved</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight text-amber-900 num">≈ {formatINR(data.estimated_rider_cost_saved)}</p>
      <p className="mt-1 text-xs text-amber-900/80">{data.estimate_note}</p>
    </Card>
  )
}

function SectionTitle({ children, badge, tone }: { children: ReactNode; badge: string; tone: string }) {
  return (
    <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-ink-faint">
      {children}<span className={`rounded px-2 py-0.5 text-[11px] ${tone}`}>{badge}</span>
    </h2>
  )
}

export function AnalyticsPage() {
  const overview = useAnalytics()
  const recent = useRecentOrders()
  useEffect(() => { document.title = 'Analytics · QuickPick Store' }, [])
  const daily = useMemo(() => buildDailySeries(recent.data?.items ?? []), [recent.data])
  const prep = useMemo(() => buildPrepSeries(recent.data?.items ?? []), [recent.data])

  return (
    <div>
      <PageHeader title="Analytics" sub="Measured numbers come from completed orders. Estimates are labelled and kept separate." />

      {overview.isError && !overview.data ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <SectionTitle badge="Measured" tone="bg-brand-100 text-brand-900">Measured from completed orders</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3" data-testid="measured-section">
            <Measured label="Total pickups completed" value={overview.data ? overview.data.total_pickups : <Skeleton className="h-10 w-16" />} />
            <Measured label="Average preparation time" value={overview.data ? formatDuration(overview.data.avg_preparation_seconds) : <Skeleton className="h-10 w-24" />} hint="Preparing → ready" />
            <Measured label="Revenue from pickups" value={overview.data ? formatINR(overview.data.total_revenue) : <Skeleton className="h-10 w-28" />} hint="What customers paid, completed orders" />
          </div>

          <SectionTitle badge="Estimated" tone="bg-amber-200 text-amber-900">Illustrative, not measured</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {overview.data ? <Illustrative data={overview.data} /> : <Skeleton className="h-36 w-full" />}
          </div>
        </>
      )}

      <SectionTitle badge="Measured" tone="bg-brand-100 text-brand-900">Orders per day</SectionTitle>
      <Card className="p-4">
        <p className="mb-2 text-xs text-ink-faint">Counted in your browser from the latest 100 orders (the API has no daily endpoint yet).</p>
        {recent.isError ? <ErrorState error={recent.error} onRetry={() => void recent.refetch()} /> : recent.isPending ? <Skeleton className="h-64 w-full" /> : (
          <div className="h-64 w-full" role="img" aria-label="Bar chart of completed and cancelled orders per day, last 7 days">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickLine={false} />
                <YAxis allowDecimals={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#166534" />
                <Bar dataKey="cancelled" name="Cancelled / expired" stackId="a" fill="#991b1b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <SectionTitle badge="Measured" tone="bg-brand-100 text-brand-900">Preparation time per order</SectionTitle>
      <Card className="p-4">
        <p className="mb-2 text-xs text-ink-faint">Minutes from “preparing” to “ready” for the latest completed orders.</p>
        {recent.isPending ? <Skeleton className="h-56 w-full" /> : prep.length === 0 ? <p className="py-8 text-center text-sm font-semibold text-ink-faint">No completed orders yet.</p> : (
          <div className="h-56 w-full" role="img" aria-label="Bar chart of preparation minutes per recent order">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prep} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="id" tickLine={false} />
                <YAxis tickLine={false} />
                <Tooltip formatter={(v) => [`${v} min`, 'Preparation']} />
                <Bar dataKey="minutes" fill="#5b21b6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  )
}
