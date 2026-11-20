import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAnalytics, useQueue } from '../hooks/queries'
import { formatDuration, formatINR, shortId } from '../lib/format'
import { StatusChip } from '../components/StatusChip'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'

export function QueuePage() {
  const queue = useQueue()
  const analytics = useAnalytics()
  useEffect(() => { document.title = 'Pickup queue · QuickPick Store' }, [])

  const ready = useMemo(
    () => (queue.data ?? []).filter((e) => e.order_status === 'READY_FOR_PICKUP').sort((a, b) => (b.ready_waiting_seconds ?? 0) - (a.ready_waiting_seconds ?? 0)),
    [queue.data],
  )
  const preparing = (queue.data ?? []).filter((e) => e.order_status === 'ACCEPTED' || e.order_status === 'PREPARING').length

  return (
    <div>
      <PageHeader title="Pickup queue" sub="Ready for pickup, longest waiting first" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm font-bold text-ink-soft">Waiting at the counter</p><p className="mt-1 text-4xl font-extrabold num">{queue.data ? ready.length : <Skeleton className="h-10 w-12" />}</p></Card>
        <Card className="p-4"><p className="text-sm font-bold text-ink-soft">Being prepared</p><p className="mt-1 text-4xl font-extrabold num">{queue.data ? preparing : <Skeleton className="h-10 w-12" />}</p></Card>
        <Card className="p-4"><p className="text-sm font-bold text-ink-soft">Typical prep time</p><p className="mt-1 text-4xl font-extrabold num">{analytics.data ? formatDuration(analytics.data.avg_preparation_seconds) : <Skeleton className="h-10 w-20" />}</p><p className="mt-1 text-xs text-ink-faint">Measured average of completed orders</p></Card>
      </div>

      {queue.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : queue.isError && !queue.data ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : ready.length === 0 ? (
        <EmptyState title="Nobody waiting for pickup" body="Orders marked ready will line up here." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-canvas text-xs font-extrabold uppercase tracking-wide text-ink-faint">
              <tr><th className="p-3">Order</th><th className="p-3">Status</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Waiting</th><th className="p-3"><span className="sr-only">Action</span></th></tr>
            </thead>
            <tbody className="divide-y divide-line text-[15px]">
              {ready.map((e, i) => (
                <tr key={e.order_id} className={i === 0 ? 'bg-st-ready-bg/40' : ''}>
                  <td className="p-3 text-lg font-extrabold num">#{shortId(e.order_id)}</td>
                  <td className="p-3"><StatusChip status={e.order_status} /></td>
                  <td className="p-3 num">{e.item_count}</td>
                  <td className="p-3 num">{formatINR(e.total_amount)}</td>
                  <td className="p-3 font-bold num">{formatDuration(e.ready_waiting_seconds)}</td>
                  <td className="p-3 text-right"><Link className="inline-flex min-h-11 items-center rounded-xl bg-cta-600 px-4 font-bold text-white hover:bg-cta-700" to={`/counter?order=${e.order_id}`}>Verify pickup</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
