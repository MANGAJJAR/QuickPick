import type { ReactNode } from 'react'
import type { OrderStatus, OrderType } from '../api/types'
import { statusLabel } from '../lib/lifecycle'
import { BagIcon, BellRingIcon, BoxIcon, CheckIcon, ClockIcon, HandIcon, XIcon } from './icons'

/** One consistent colour AND icon per status, so status never relies on colour alone. */
export const STATUS_STYLE: Record<OrderStatus, { cls: string; icon: ReactNode }> = {
  CREATED: { cls: 'bg-st-placed-bg text-st-placed', icon: <ClockIcon size={14} /> },
  PLACED: { cls: 'bg-st-placed-bg text-st-placed', icon: <BellRingIcon size={14} /> },
  ACCEPTED: { cls: 'bg-st-accepted-bg text-st-accepted', icon: <CheckIcon size={14} /> },
  PREPARING: { cls: 'bg-st-preparing-bg text-st-preparing', icon: <BoxIcon size={14} /> },
  READY_FOR_PICKUP: { cls: 'bg-st-ready-bg text-st-ready', icon: <BagIcon size={14} /> },
  OUT_FOR_DELIVERY: { cls: 'bg-st-accepted-bg text-st-accepted', icon: <BagIcon size={14} /> },
  DELIVERED: { cls: 'bg-st-completed-bg text-st-completed', icon: <HandIcon size={14} /> },
  COMPLETED: { cls: 'bg-st-completed-bg text-st-completed', icon: <HandIcon size={14} /> },
  CANCELLED: { cls: 'bg-st-cancelled-bg text-st-cancelled', icon: <XIcon size={14} /> },
  EXPIRED: { cls: 'bg-st-cancelled-bg text-st-cancelled', icon: <ClockIcon size={14} /> },
}

export function StatusChip({ status, type }: { status: OrderStatus; type?: OrderType }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-extrabold uppercase tracking-wide ${s.cls}`} data-status={status}>
      {s.icon}
      {statusLabel(status, type)}
    </span>
  )
}
