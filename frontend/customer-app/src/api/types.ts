/** Types mirroring the backend contracts (backend/docs/API_CONTRACTS.md, verified against /openapi.json).
 *  Money is a decimal STRING, never a number; timestamps are ISO-8601 UTC strings. */

export type Money = string

export interface Pagination {
  limit: number
  next_cursor: string | null
  has_more: boolean
}

export interface GeoLocation {
  lat: number
  lng: number
}

export type StoreOperatingStatus = 'OPEN' | 'PAUSED' | 'CLOSED'

export interface Store {
  id: string
  name: string
  address: string
  location: GeoLocation
  operating_status: StoreOperatingStatus
  pickup_enabled: boolean
  preparation_capacity: number
  created_at: string
  updated_at: string
}

export interface StoreWithDistance {
  store: Store
  distance_km: number
}

export interface Product {
  id: string
  name: string
  description: string
  category: string
  image_url: string | null
  price: Money
  unit: string
  is_active: boolean
}

/** Product plus the selected store's pickable stock (null when no store was requested). */
export interface ProductView {
  product: Product
  store_id: string | null
  pickable_quantity: number | null
  in_stock: boolean | null
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

export interface Pricing {
  subtotal: Money
  delivery_fee: Money
  pickup_discount: Money
  pickup_fee: Money
  total_amount: Money
  you_save: Money
  rider_cost_saved: Money
  platform_net_saving: Money
}

export interface CheckoutPreview {
  store_id: string
  items: OrderItem[]
  pricing: Pricing
  message: string
}

export interface PickupCredential {
  order_id: string
  qr_payload: string
  otp: string
  expires_at: string
}

export interface UserProfile {
  uid: string
  name: string
  email: string | null
  phone: string | null
  role: string
  created_at: string
  updated_at: string
}

/** NOT in the backend yet (GET /customer/notifications is unimplemented). */
export interface AppNotification {
  id: string
  title: string
  body: string
  order_id: string | null
  read: boolean
  created_at: string
}

export interface CartLine {
  product_id: string
  quantity: number
}

export interface Page<T> {
  items: T[]
  pagination: Pagination | null
}

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED']

/** Mirrors the lifecycle: the customer may cancel only before preparation starts. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['PLACED', 'ACCEPTED']
