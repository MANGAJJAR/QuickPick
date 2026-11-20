import type { Api } from './api'
import { ApiError } from './client'
import { DEMO_PRODUCTS, DEMO_STOCK, DEMO_STORES } from './demoData'
import type {
  AppNotification,
  CartLine,
  Order,
  OrderItem,
  OrderStatus,
  Page,
  PickupCredential,
  Pricing,
  Product,
  ProductView,
  Store,
} from './types'

/**
 * MOCK BACKEND (VITE_USE_MOCKS=true). A fake server running in the browser so the UI can be
 * built and demoed without the backend. It imitates the real contract (same shapes, error
 * codes, 25 INR pickup discount, idempotency) but is NOT the real backend.
 * Orders advance automatically: PLACED -> ACCEPTED (5s) -> PREPARING (12s) -> READY (22s).
 */

const NOW = () => new Date().toISOString()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const LATENCY = 220

const stores: Store[] = [
  ...DEMO_STORES.map((d): Store => ({
    id: d.id, name: `${d.name}`, address: d.address, location: { lat: d.lat, lng: d.lng },
    operating_status: 'OPEN', pickup_enabled: true, preparation_capacity: d.capacity, created_at: NOW(), updated_at: NOW(),
  })),
  // One closed store, so the "closed" UI always has an example.
  {
    id: 'store-c', name: 'Vastrapur Dark Store', address: 'Vastrapur, Ahmedabad',
    location: { lat: 23.0395, lng: 72.5295 }, operating_status: 'CLOSED', pickup_enabled: true,
    preparation_capacity: 8, created_at: NOW(), updated_at: NOW(),
  },
]

const mk = (id: string, name: string, category: string, price: string, unit: string): Product => ({
  id, name, description: '', category, image_url: null, price, unit, is_active: true,
})

const products: Product[] = DEMO_PRODUCTS.map((p) => mk(p.id, p.name, p.category, p.price, p.unit))

// stock[storeId][productId] = pickable quantity
const stock: Record<string, Record<string, number>> = { ...DEMO_STOCK, 'store-c': { milk: 5 } }

interface MockOrder { order: Order; createdAtMs: number; override?: OrderStatus; lastNotified: OrderStatus }
const orders = new Map<string, MockOrder>()
const byKey = new Map<string, string>()
const notifications: AppNotification[] = [
  { id: 'n-seed-1', title: 'Welcome to QuickPick', body: 'Skip the delivery fee: pick up from a store near you.', order_id: null, read: false, created_at: NOW() },
]

const rupees = (paise: number) => (paise / 100).toFixed(2)
const toPaise = (s: string) => Math.round(Number(s) * 100)

function price(items: OrderItem[]): Pricing {
  const subtotal = items.reduce((a, i) => a + toPaise(i.line_total), 0)
  const discount = Math.min(2500, subtotal)
  return {
    subtotal: rupees(subtotal), delivery_fee: '0.00', pickup_discount: rupees(discount), pickup_fee: '4.00',
    total_amount: rupees(subtotal - discount), you_save: rupees(discount), rider_cost_saved: '35.00',
    platform_net_saving: rupees(3500 - discount - 400),
  }
}

function buildItems(storeId: string, lines: CartLine[]): OrderItem[] {
  const merged = new Map<string, number>()
  for (const l of lines) merged.set(l.product_id, (merged.get(l.product_id) ?? 0) + l.quantity)
  return [...merged].map(([pid, qty]) => {
    const p = products.find((x) => x.id === pid)
    if (!p) throw new ApiError(404, 'product_unavailable', `Product ${pid} is not available`)
    const have = stock[storeId]?.[pid] ?? 0
    if (have < qty) throw new ApiError(409, 'insufficient_stock', `Insufficient stock for ${p.name} (requested ${qty}, available ${have})`)
    return { product_id: pid, name: p.name, unit_price: p.price, quantity: qty, line_total: rupees(toPaise(p.price) * qty) }
  })
}

function openStore(storeId: string): Store {
  const s = stores.find((x) => x.id === storeId)
  if (!s || !s.pickup_enabled) throw new ApiError(404, 'not_found', 'Store not found')
  if (s.operating_status !== 'OPEN') throw new ApiError(409, 'store_not_accepting_orders', 'Store is not accepting orders right now')
  return s
}

const SCHEDULE: [OrderStatus, number][] = [['PLACED', 0], ['ACCEPTED', 5000], ['PREPARING', 12000], ['READY_FOR_PICKUP', 22000]]

function notify(order: Order, title: string, body: string) {
  notifications.unshift({ id: `n-${crypto.randomUUID()}`, title, body, order_id: order.id, read: false, created_at: NOW() })
}

function refresh(m: MockOrder): Order {
  if (m.override) { m.order.order_status = m.override } else {
    const age = Date.now() - m.createdAtMs
    const current = [...SCHEDULE].reverse().find(([, t]) => age >= t)?.[0] ?? 'PLACED'
    m.order.order_status = current
  }
  const s = m.order.order_status
  if (s !== m.lastNotified) {
    m.lastNotified = s
    m.order.status_history = [...m.order.status_history, { status: s, at: NOW(), actor_uid: null, note: null }]
    const copy: Partial<Record<OrderStatus, [string, string]>> = {
      ACCEPTED: ['Order accepted', 'The store accepted your order.'],
      PREPARING: ['Packing your order', 'The store is preparing your items.'],
      READY_FOR_PICKUP: ['Ready for pickup', 'Show your QR code at the pickup counter.'],
      COMPLETED: ['Pickup complete', 'Enjoy! Thanks for picking up with QuickPick.'],
      CANCELLED: ['Order cancelled', 'Your order was cancelled.'],
    }
    const c = copy[s]
    if (c) notify(m.order, c[0], c[1])
  }
  m.order.updated_at = NOW()
  return structuredClone(m.order)
}

function find(id: string): MockOrder {
  const m = orders.get(id)
  if (!m) throw new ApiError(404, 'not_found', 'Order not found')
  return m
}

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h))
}

const page = <T>(items: T[]): Page<T> => ({ items, pagination: { limit: items.length, next_cursor: null, has_more: false } })

export function createMockApi(): Api {
  return {
    isMock: true,

    async getMe() {
      await sleep(LATENCY)
      return { uid: 'mock-user', name: 'Demo Customer', email: 'demo@quickpick.app', phone: null, role: 'CUSTOMER', created_at: NOW(), updated_at: NOW() }
    },

    async nearbyStores(lat, lng, radiusKm) {
      await sleep(LATENCY)
      return stores
        .filter((s) => s.pickup_enabled)
        .map((s) => ({ store: s, distance_km: Math.round(haversine({ lat, lng }, s.location) * 1000) / 1000 }))
        .filter((s) => s.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km)
    },

    async listStores() {
      await sleep(LATENCY)
      return page(stores)
    },

    async getStore(id) {
      await sleep(LATENCY)
      const s = stores.find((x) => x.id === id)
      if (!s) throw new ApiError(404, 'not_found', 'Store not found')
      return s
    },

    async listProducts(storeId) {
      await sleep(LATENCY)
      const items: ProductView[] = products.map((p) => {
        const q = stock[storeId]?.[p.id] ?? 0
        return { product: p, store_id: storeId, pickable_quantity: q, in_stock: q > 0 }
      })
      return page(items)
    },

    async previewCheckout(storeId, lines) {
      await sleep(LATENCY)
      openStore(storeId)
      const items = buildItems(storeId, lines)
      const pricing = price(items)
      return { store_id: storeId, items, pricing, message: `You save ₹${Number(pricing.you_save)} vs delivery` }
    },

    async createOrder(storeId, lines, key) {
      await sleep(LATENCY * 2)
      const existing = byKey.get(key)
      if (existing) return { order: refresh(find(existing)), created: false }
      openStore(storeId)
      const items = buildItems(storeId, lines)
      for (const i of items) stock[storeId]![i.product_id]! -= i.quantity
      const p = price(items)
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
      const now = NOW()
      const order: Order = {
        id, customer_id: 'mock-user', store_id: storeId, items, subtotal: p.subtotal, delivery_fee: p.delivery_fee,
        pickup_discount: p.pickup_discount, pickup_fee: p.pickup_fee, total_amount: p.total_amount, order_type: 'PICKUP',
        order_status: 'PLACED', pickup_code_reference: null, idempotency_key: key,
        status_history: [{ status: 'CREATED', at: now, actor_uid: 'mock-user', note: null }, { status: 'PLACED', at: now, actor_uid: 'mock-user', note: null }],
        cancel_reason: null, accepted_at: null, preparing_at: null, ready_at: null, completed_at: null, cancelled_at: null,
        expired_at: null, created_at: now, updated_at: now,
      }
      orders.set(id, { order, createdAtMs: Date.now(), lastNotified: 'PLACED' })
      byKey.set(key, id)
      notify(order, 'Order placed', 'We sent your order to the store.')
      return { order: structuredClone(order), created: true }
    },

    async listOrders() {
      await sleep(LATENCY)
      return page([...orders.values()].map(refresh).sort((a, b) => b.created_at.localeCompare(a.created_at)))
    },

    async getOrder(id) {
      await sleep(LATENCY / 2)
      return refresh(find(id))
    },

    async cancelOrder(id, reason) {
      await sleep(LATENCY)
      const m = find(id)
      const current = refresh(m).order_status
      if (current !== 'PLACED' && current !== 'ACCEPTED') {
        throw new ApiError(409, 'order_not_cancellable', `Orders in ${current} can no longer be cancelled by the customer`)
      }
      for (const i of m.order.items) stock[m.order.store_id]![i.product_id]! += i.quantity
      m.override = 'CANCELLED'
      m.order.cancel_reason = reason ?? 'Cancelled by customer'
      m.order.cancelled_at = NOW()
      return refresh(m)
    },

    async getPickupCredential(orderId): Promise<PickupCredential> {
      await sleep(LATENCY)
      const status = refresh(find(orderId)).order_status
      if (status !== 'READY_FOR_PICKUP') throw new ApiError(409, 'order_not_ready', 'Pickup credential is only available when the order is ready for pickup')
      const expires = new Date(Date.now() + 90_000)
      return {
        order_id: orderId,
        qr_payload: `qp1.${orderId}.${Math.floor(expires.getTime() / 1000)}.mocknonce${Math.random().toString(36).slice(2, 8)}.mocksig`,
        otp: String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'),
        expires_at: expires.toISOString(),
      }
    },

    async listNotifications() {
      await sleep(LATENCY / 2)
      return structuredClone(notifications)
    },

    async markNotificationRead(id) {
      await sleep(80)
      const n = notifications.find((x) => x.id === id)
      if (n) n.read = true
    },

    async mockCompleteOrder(orderId) {
      await sleep(LATENCY)
      find(orderId).override = 'COMPLETED'
      find(orderId).order.completed_at = NOW()
    },
  }
}
