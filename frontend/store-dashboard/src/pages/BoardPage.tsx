import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { config } from '../config'
import { useBoard } from '../hooks/queries'
import { useNewOrderAlert, useNow } from '../hooks/utility'
import { OrderCard } from '../components/OrderCard'
import { OrderDrawer } from '../components/OrderDrawer'
import { StatusChip } from '../components/StatusChip'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'

export function BoardPage() {
  const board = useBoard()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const openId = params.get('order')
  const flashing = useNewOrderAlert(board.data?.PLACED)
  useEffect(() => { document.title = 'Orders · QuickPick Store' }, [])

  const open = useCallback((id: string) => setParams({ order: id }), [setParams])
  const close = useCallback(() => setParams({}), [setParams])
  const total = board.data ? config.boardStatuses.reduce((n, s) => n + board.data[s].length, 0) : 0

  return (
    <div>
      <PageHeader title="Orders" sub={board.isFetching && board.data ? 'Live · updating…' : 'Live board · refreshes every 5 seconds'} />

      {board.isPending ? (
        <div className="grid gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading orders">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full" />)}</div>
      ) : board.isError && !board.data ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : (
        <>
          {board.isError && <p role="alert" className="mb-3 rounded-lg bg-warn-50 p-3 text-sm font-bold text-warn-600">Couldn’t refresh just now. Showing the last data we have.</p>}
          {total === 0 && <EmptyState title="No orders right now" body="New orders appear here automatically and play a sound." />}
          <div className={`mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5 ${total === 0 ? 'hidden' : ''}`}>
            {config.boardStatuses.map((status) => {
              const list = board.data?.[status] ?? []
              return (
                <section key={status} aria-label={`${status} orders`} className="min-w-0 rounded-xl bg-canvas">
                  <header className="mb-2 flex items-center justify-between px-1">
                    <StatusChip status={status} />
                    <span className="text-lg font-extrabold num" aria-label={`${list.length} orders`}>{list.length}</span>
                  </header>
                  <div className="space-y-3">
                    {list.length === 0 ? (
                      <p className="rounded-xl border-2 border-dashed border-line px-3 py-6 text-center text-sm font-semibold text-ink-faint">None</p>
                    ) : (
                      list.map((o) => <OrderCard key={o.id} order={o} now={now} flash={flashing.has(o.id)} onOpen={open} />)
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}

      {openId && <OrderDrawer orderId={openId} onClose={close} />}
    </div>
  )
}
