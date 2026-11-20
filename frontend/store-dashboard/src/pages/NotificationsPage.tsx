import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMarkNotificationRead, useNotifications } from '../hooks/queries'
import { formatDateTime } from '../lib/format'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pill, Skeleton } from '../components/ui'

export function NotificationsPage() {
  const list = useNotifications()
  const mark = useMarkNotificationRead()
  const navigate = useNavigate()
  useEffect(() => { document.title = 'Alerts · QuickPick Store' }, [])

  // The backend has no notifications endpoints yet (dark-store module backlog). Say so honestly.
  const unavailable = list.error instanceof ApiError && (list.error.status === 404 || list.error.status === 405)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Alerts" />
      {list.isPending ? (
        <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : unavailable ? (
        <EmptyState title="Alerts aren’t available yet" body="The backend doesn’t provide store alerts yet. New orders still appear on the Orders board with a sound." />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No alerts" body="You’re all caught up." />
      ) : (
        <ul className="space-y-3">
          {list.data.map((n) => (
            <li key={n.id}>
              <Card className={`flex items-start justify-between gap-3 p-4 ${n.read ? '' : 'border-2 border-wheat-500 bg-wheat-50'}`}>
                <div>
                  <p className="font-extrabold">{n.title}{!n.read && <span className="sr-only"> (unread)</span>}</p>
                  <p className="text-sm text-ink-soft">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-faint">{formatDateTime(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {!n.read && <Pill tone="warn">New</Pill>}
                  {n.order_id && <Button size="sm" variant="secondary" onClick={() => navigate(`/orders?order=${n.order_id}`)}>View order</Button>}
                  {!n.read && <Button size="sm" variant="ghost" loading={mark.isPending && mark.variables === n.id} onClick={() => mark.mutate(n.id)} aria-label={`Mark "${n.title}" as read`}>Mark read</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
