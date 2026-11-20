import type { OrderStatus } from '../api/types'

/** What store staff can do next. Mirrors backend/docs/ORDER_LIFECYCLE.md and the action endpoints. */
export type OrderAction = 'accept' | 'reject' | 'start' | 'ready'

export interface ActionSet {
  /** The single obvious next step (null once the order is out of the store's hands). */
  primary: { action: OrderAction | 'verify'; label: string } | null
  /** Optional secondary action (reject, only while PLACED: the API allows nothing else). */
  secondary: { action: 'reject'; label: string } | null
}

export function actionsFor(status: OrderStatus): ActionSet {
  switch (status) {
    case 'PLACED':
      return { primary: { action: 'accept', label: 'Accept order' }, secondary: { action: 'reject', label: 'Reject' } }
    case 'ACCEPTED':
      return { primary: { action: 'start', label: 'Start preparing' }, secondary: null }
    case 'PREPARING':
      return { primary: { action: 'ready', label: 'Mark ready' }, secondary: null }
    case 'READY_FOR_PICKUP':
      return { primary: { action: 'verify', label: 'Verify pickup' }, secondary: null }
    default:
      return { primary: null, secondary: null }
  }
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: 'Created',
  PLACED: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Handed over',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}
