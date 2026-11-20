import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Order } from '../api/types'
import { useOrderAction } from '../hooks/queries'
import { actionsFor } from '../lib/lifecycle'
import { Button } from './ui'
import { RejectDialog } from './RejectDialog'

/**
 * The actions the lifecycle permits for this order, nothing else. Status changes only through the
 * backend action endpoints; the buttons disable while a request is in flight (no double submits).
 */
export function OrderActions({ order, size = 'lg' }: { order: Order; size?: 'lg' | 'md' }) {
  const { primary, secondary } = actionsFor(order.order_status, order.order_type)
  const run = useOrderAction()
  const [rejecting, setRejecting] = useState(false)
  if (!primary) return null

  const busy = run.isPending
  const error = run.error instanceof Error ? run.error.message : null

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {primary.action === 'verify' ? (
          <Link
            to={`/counter?order=${order.id}`}
            className={`inline-flex flex-1 items-center justify-center rounded-xl bg-cta-600 font-bold text-white  transition hover:brightness-90 active:scale-[0.98] ${size === 'lg' ? 'min-h-14 text-lg' : 'min-h-12 text-base'}`}
          >
            {primary.label}
          </Link>
        ) : (
          <Button
            className="flex-1"
            size={size}
            loading={busy}
            disabled={busy}
            onClick={() => {
              if (!busy) run.mutate({ id: order.id, action: primary.action as 'accept' | 'start' | 'ready' | 'dispatch' | 'deliver' })
            }}
          >
            {primary.label}
          </Button>
        )}
        {secondary && (
          <Button variant="danger" size={size} disabled={busy} onClick={() => setRejecting(true)}>
            {secondary.label}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger-600">{error}</p>}
      {rejecting && (
        <RejectDialog
          orderNumber={order.id.slice(0, 8).toUpperCase()}
          pending={busy}
          error={error}
          onCancel={() => setRejecting(false)}
          onConfirm={(reason) => run.mutate({ id: order.id, action: 'reject', reason }, { onSuccess: () => setRejecting(false) })}
        />
      )}
    </div>
  )
}
