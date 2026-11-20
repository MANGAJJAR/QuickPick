import type { ArrivalStatus, Order } from '../api/types'
import { useShareArrival } from '../hooks/queries'
import { Button, Card } from './ui'

const ETAS = [5, 10, 15] as const

/** Which order states let the customer tell the store they are coming (mirrors the backend rule). */
export const ARRIVAL_STATES: Order['order_status'][] = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']

function summary(status: ArrivalStatus | null | undefined, eta: number | null | undefined): string | null {
  if (status === 'ARRIVED') return 'You told the store you’re here.'
  if (status === 'ON_THE_WAY') return `You told the store you’re ${eta ?? '?'} min away.`
  return null
}

/** "5 min away" / "I'm here". Sends no location, only the words the customer chose. */
export function ArrivalPanel({ order }: { order: Order }) {
  const share = useShareArrival(order.id)
  if (!ARRIVAL_STATES.includes(order.order_status)) return null
  const status = order.arrival_status ?? null
  const current = summary(status, order.arrival_eta_minutes)
  const busy = share.isPending
  const chip = (active: boolean) =>
    `min-h-12 rounded-xl border-2 px-4 text-base font-extrabold transition active:scale-95 disabled:opacity-50 ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-ink hover:border-brand-200 hover:bg-brand-50'}`

  return (
    <Card className="p-5" aria-labelledby="arrival-title">
      <h2 id="arrival-title" className="text-lg font-extrabold">On your way?</h2>
      <p className="mt-1 text-sm text-ink-soft">Tell the store when you’ll arrive and they’ll have your order at the counter. We never share your location.</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="How far away are you?">
        {ETAS.map((m) => (
          <button key={m} className={chip(status === 'ON_THE_WAY' && order.arrival_eta_minutes === m)} disabled={busy} aria-pressed={status === 'ON_THE_WAY' && order.arrival_eta_minutes === m} onClick={() => share.mutate({ status: 'ON_THE_WAY', eta_minutes: m })}>
            {m} min away
          </button>
        ))}
        <button className={chip(status === 'ARRIVED')} disabled={busy} aria-pressed={status === 'ARRIVED'} onClick={() => share.mutate({ status: 'ARRIVED' })}>
          I’m here
        </button>
      </div>

      {current && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-wheat-100 px-3 py-2 text-sm font-bold text-accent">
          {current}
          <Button size="sm" variant="ghost" loading={busy && share.variables === null} onClick={() => share.mutate(null)}>Undo</Button>
        </p>
      )}
      {share.isError && <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">{share.error.message}</p>}
    </Card>
  )
}
