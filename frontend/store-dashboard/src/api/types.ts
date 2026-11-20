/** Types mirroring the backend contracts (backend/docs/API_CONTRACTS.md, verified against the running API).
 *  Money is a decimal STRING; timestamps are ISO-8601 UTC strings. */

export type Money = string

export interface Pagination {
  limit: number
  next_cursor: string | null
  has_more: boolean
}

export interface Page<T> {
  items: T[]
  pagination: Pagination | null
}

export type StoreOperatingStatus = 'OPEN' | 'PAUSED' | 'CLOSED'

export interface Store {
  id: string
  name: string
  address: string
  location: { lat: number; lng: number }
  operating_status: StoreOperatingStatus
  pickup_enabled: boolean
  preparation_capacity: number
  created_at: string
  updated_at: string
}

export type OrderStatus =
  | 'CREATED'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'

export interface OrderItem {
  product_id: string
  name: string
  unit_price: Money
  quantity: number
  line_total: Money
}

export interface StatusEvent {
  status: OrderStatus
  at: string
  actor_uid: string | null
  note: string | null
}

export interface Order {
  id: string
  customer_id: string
  store_id: string
  items: OrderItem[]
  subtotal: Money
  delivery_fee: Money
  pickup_discount: Money
  pickup_fee: Money
  total_amount: Money
  order_type: 'PICKUP'
  order_status: OrderStatus
  pickup_code_reference: string | null
  idempotency_key: string
  status_history: StatusEvent[]
  cancel_reason: string | null
  accepted_at: string | null
  preparing_at: string | null
  ready_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  expired_at: string | null
  created_at: string
  updated_at: string
}

/** Inventory row. The API returns the product id only (no name/category): see docs/DARK_STORE_FRONTEND.md. */
export interface InventoryRow {
  store_id: string
  product_id: string
  /** Physical units on the shelf. */
  available_quantity: number
  /** Units promised to open orders. Only the backend changes this. */
  reserved_quantity: number
  /** available - reserved, computed by the backend. */
  pickable_quantity: number
  updated_at: string
}

export interface QueueEntry {
  order_id: string
  order_status: OrderStatus
  item_count: number
  total_amount: Money
  placed_at: string
  preparation_elapsed_seconds: number | null
  ready_waiting_seconds: number | null
}

export interface AnalyticsOverview {
  total_pickups: number
  avg_preparation_seconds: number | null
  total_revenue: Money
  /** ILLUSTRATIVE estimate, not measured. */
  estimated_rider_cost_saved: Money
  estimate_note: string
}

/** NOT in the backend yet (GET /store/notifications is unimplemented). */
export interface AppNotification {
  id: string
  title: string
  body: string
  order_id: string | null
  read: boolean
  created_at: string
}

export type StoreRole = 'STORE_STAFF' | 'STORE_MANAGER'

export const ACTIVE_STATUSES: readonly OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED']
