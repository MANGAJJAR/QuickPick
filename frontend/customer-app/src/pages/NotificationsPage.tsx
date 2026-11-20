import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { Badge, Button, Card, EmptyState, ErrorState, PageTitle, Skeleton, ButtonLink } from '../components/ui'
import { PushToggle } from '../components/PushToggle'
import { useMarkNotificationRead, useNotifications } from '../hooks/queries'
import { formatDateTime } from '../lib/format'

export function NotificationsPage() {
  const list = useNotifications()
  const markRead = useMarkNotificationRead()
  useEffect(() => { document.title = 'Alerts · QuickPick' }, [])

  // Older backends have no notification endpoints; keep an honest fallback instead of an error.
  const unavailable = list.error instanceof ApiError && (list.error.status === 404 || list.error.status === 405)

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Alerts</PageTitle>
      <PushToggle />
      {list.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading alerts">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : unavailable ? (
        <EmptyState title="Alerts aren’t available yet" body="Order alerts are coming soon. For now, open an order to see its live status." action={<ButtonLink to="/orders" variant="secondary">Your orders</ButtonLink>} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No alerts yet" body="We’ll let you know when your order is accepted and ready." />
      ) : (
        <ul className="space-y-3">
          {list.data.map((n) => (
            <li key={n.id}>
              <Card className={`p-4 ${n.read ? '' : 'border-brand-600/40 bg-brand-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{n.title}{!n.read && <span className="sr-only"> (unread)</span>}</p>
                    <p className="text-sm text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-faint">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.read && <Badge tone="good">New</Badge>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {n.order_id && <Link to={`/orders/${n.order_id}`}><Button variant="secondary" size="sm">View order</Button></Link>}
                  {!n.read && <Button variant="ghost" size="sm" loading={markRead.isPending && markRead.variables === n.id} onClick={() => markRead.mutate(n.id)} aria-label={`Mark "${n.title}" as read`}>Mark as read</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
