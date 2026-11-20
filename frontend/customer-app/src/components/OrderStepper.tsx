import type { OrderStatus, OrderType, StatusEvent } from '../api/types'
import { CheckIcon } from './icons'

export const STEPS = [
  { key: 'PLACED', label: 'Placed', hint: 'Sent to the store' },
  { key: 'ACCEPTED', label: 'Accepted', hint: 'Store confirmed' },
  { key: 'PREPARING', label: 'Preparing', hint: 'Being packed' },
  { key: 'READY_FOR_PICKUP', label: 'Ready', hint: 'Come to the counter' },
  { key: 'COMPLETED', label: 'Picked up', hint: 'All done' },
] as const

/** Delivery orders: packed, then handed to a rider, then delivered. */
export const DELIVERY_STEPS = [
  { key: 'PLACED', label: 'Placed', hint: 'Sent to the store' },
  { key: 'ACCEPTED', label: 'Accepted', hint: 'Store confirmed' },
  { key: 'PREPARING', label: 'Preparing', hint: 'Being packed' },
  { key: 'READY_FOR_PICKUP', label: 'Packed', hint: 'Waiting for a rider' },
  { key: 'OUT_FOR_DELIVERY', label: 'On the way', hint: 'A rider has your order' },
  { key: 'DELIVERED', label: 'Delivered', hint: 'All done' },
] as const

export type StepState = 'done' | 'current' | 'upcoming'

export interface StepperModel {
  steps: { key: OrderStatus; label: string; hint: string; state: StepState }[]
  /** Set for orders that ended early; the stepper freezes where the order stopped. */
  terminal: 'CANCELLED' | 'EXPIRED' | null
}

/** Pure mapping from order status (+history for early exits) to stepper state. */
export function buildStepperModel(status: OrderStatus, history: StatusEvent[] = [], type: OrderType = 'PICKUP'): StepperModel {
  const steps = type === 'DELIVERY' ? DELIVERY_STEPS : STEPS
  const order = steps.map((s) => s.key as OrderStatus)
  let terminal: StepperModel['terminal'] = null
  let reachedIndex: number
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    terminal = status
    const reached = history.map((h) => order.indexOf(h.status)).filter((i) => i >= 0)
    reachedIndex = reached.length ? Math.max(...reached) : 0
  } else {
    reachedIndex = Math.max(0, order.indexOf(status)) // CREATED shows as PLACED
  }
  return {
    terminal,
    steps: steps.map((s, i) => ({
      ...s,
      state: terminal
        ? i <= reachedIndex ? 'done' : 'upcoming'
        : status === 'COMPLETED' || status === 'DELIVERED' || i < reachedIndex ? 'done' : i === reachedIndex ? 'current' : 'upcoming',
    })),
  }
}

export function OrderStepper({ status, history, type = 'PICKUP' }: { status: OrderStatus; history?: StatusEvent[]; type?: OrderType }) {
  const model = buildStepperModel(status, history, type)
  return (
    <div>
      <ol className="relative" aria-label="Order progress">
        {model.steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={s.state === 'current' ? 'step' : undefined} data-state={s.state}>
            {i < model.steps.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${s.state === 'done' ? 'bg-brand-600' : 'bg-line'}`} aria-hidden="true" />}
            <span
              className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                s.state === 'done' ? 'bg-brand-600 text-white' : s.state === 'current' ? 'anim-pulse-ring bg-brand-100 text-accent ring-2 ring-brand-600' : 'bg-canvas text-ink-faint ring-1 ring-line'
              }`}
            >
              {s.state === 'done' ? <CheckIcon width={16} height={16} /> : i + 1}
            </span>
            <div key={`${s.key}-${s.state}`} className={s.state === 'current' ? 'anim-pop' : ''}>
              <p className={`font-semibold ${s.state === 'upcoming' ? 'text-ink-faint' : ''}`}>
                {s.label}
                <span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current step)' : ' (upcoming)'}</span>
              </p>
              <p className="text-sm text-ink-faint">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
      {model.terminal && (
        <p role="status" className="mt-4 rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-600">
          {model.terminal === 'CANCELLED' ? 'This order was cancelled.' : type === 'DELIVERY' ? 'This order expired before it was accepted.' : 'This order expired and was not picked up.'}
        </p>
      )}
    </div>
  )
}
