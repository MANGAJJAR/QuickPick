import type { OrderStatus, OrderType } from '../api/types'

/** What store staff can do next. Mirrors backend/docs/ORDER_LIFECYCLE.md and the action endpoints. */
export type OrderAction = 'accept' | 'reject' | 'start' | 'ready' | 'dispatch' | 'deliver'

export interface ActionSet {
  /** The single obvious next step (null once the order is out of the store's hands). */
  primary: { action: OrderAction | 'verify'; label: string } | null
  /** Optional secondary action (reject, only while PLACED: the API allows nothing else). */
  secondary: { action: 'reject'; label: string } | null
}

export function actionsFor(status: OrderStatus, type: OrderType = 'PICKUP'): ActionSet {
  switch (status) {
    case 'PLACED':
      return { primary: { action: 'accept', label: 'Accept order' }, secondary: { action: 'reject', label: 'Reject' } }
    case 'ACCEPTED':
      return { primary: { action: 'start', label: 'Start preparing' }, secondary: null }
    case 'PREPARING':
      return { primary: { action: 'ready', label: 'Mark ready' }, secondary: null }
    case 'READY_FOR_PICKUP':
      // A packed delivery waits for a rider; a packed pickup waits for the customer at the counter.
      return type === 'DELIVERY'
        ? { primary: { action: 'dispatch', label: 'Send with rider' }, secondary: null }
        : { primary: { action: 'verify', label: 'Verify pickup' }, secondary: null }
    case 'OUT_FOR_DELIVERY':
      return { primary: { action: 'deliver', label: 'Mark delivered' }, secondary: null }
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
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  COMPLETED: 'Handed over',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

/** The same status reads differently for deliveries: a packed delivery is not "ready for pickup". */
export function statusLabel(status: OrderStatus, type: OrderType = 'PICKUP'): string {
  if (type === 'DELIVERY' && status === 'READY_FOR_PICKUP') return 'Packed'
  return STATUS_LABEL[status]
}
