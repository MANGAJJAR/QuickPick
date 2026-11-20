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
  | 'READY_FOR_PICKUP' // for delivery orders: packed, waiting for a rider
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
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
  order_type: OrderType
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
  delivery_address?: DeliveryAddress | null
  /** Estimate shown at checkout for delivery orders. Not a promise. */
  delivery_eta_minutes?: number | null
  /** Set only when the "riders are busy" walk-in discount applied. */
  surge_multiplier?: string | null
  walk_distance_m?: number | null
  dispatched_at?: string | null
  delivered_at?: string | null
  /** Auto-expiry deadline: PLACED = store must accept by then, READY_FOR_PICKUP = customer must collect by then. */
  expires_at?: string | null
  /** The customer's own "5 min away" / "I'm here" signal. */
  arrival_status?: ArrivalStatus | null
  arrival_eta_minutes?: number | null
  arrival_updated_at?: string | null
  created_at: string
  updated_at: string
}

export type OrderType = 'PICKUP' | 'DELIVERY'

export interface DeliveryAddress {
  line: string
  lat?: number | null
  lng?: number | null
  instructions?: string | null
}

export interface Coords {
  lat: number
  lng: number
}

/** "Riders are busy. Walk 3 min and save ₹40": what the server says about walking to the store right now. */
export interface WalkOffer {
  surge_active: boolean
  /** Surge is on AND the customer is within walking distance. */
  eligible: boolean
  walk_minutes: number | null
  distance_m: number | null
  pickup_discount: Money
  headline: string | null
  reasons: string[]
  delivery_eta_minutes: number
  /** Where each signal comes from (e.g. rider supply is simulated). */
  sources: Record<string, string>
}

export type ArrivalStatus = 'ON_THE_WAY' | 'ARRIVED'

export interface ArrivalInput {
  status: ArrivalStatus
  /** Required for ON_THE_WAY (1 to 120). */
  eta_minutes?: number
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
  /** PICKUP pricing for this customer right now (includes the walk-in discount when it applies). */
  pricing: Pricing
  message: string
  /** The same cart delivered. */
  delivery?: Pricing
  delivery_eta_minutes?: number
  offer?: WalkOffer
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

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'DELIVERED', 'CANCELLED', 'EXPIRED']

/** Mirrors the lifecycle: the customer may cancel only before preparation starts. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['PLACED', 'ACCEPTED']
