import type { Api, DemoCredential } from './api'
import { ApiError } from './client'
import { DEMO_PRODUCTS, DEMO_STOCK_STORE_A } from './demoCatalogue'
import type {
  AnalyticsOverview,
  AppNotification,
  InventoryRow,
  Order,
  OrderItem,
  OrderStatus,
  Page,
  QueueEntry,
  Store, DeliveryAddress, OrderType, RiderSupply, Signals, Weather } from './types'

/**
 * MOCK BACKEND (VITE_USE_MOCKS=true): a fake server running in the browser so the dashboard can be
 * built and demoed without the backend. It imitates the real contract (shapes, error codes,
 * lifecycle rules, reserved-stock rules, pickup verification failures) and streams new incoming
 * orders every ~20s. It is NOT the real backend.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const LATENCY = 180
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const rid = () => crypto.randomUUID().replace(/-/g, '')
const paise = (s: string) => Math.round(Number(s) * 100)
const rupees = (p: number) => (p / 100).toFixed(2)

const CATALOGUE: Record<string, { name: string; price: string }> = Object.fromEntries(
  DEMO_PRODUCTS.map((p) => [p.id, { name: `${p.name} ${p.unit}`, price: p.price }]),
)

interface Credential { qr: string; otp: string; expiresAt: number; used: boolean; attempts: number }

export function createMockApi(): Api {
  const store: Store = {
    id: 'store-a', name: 'Satellite Dark Store', address: 'Satellite Rd, Ahmedabad', location: { lat: 23.0258, lng: 72.5873 },
    operating_status: 'OPEN', pickup_enabled: true, preparation_capacity: 10, created_at: iso(), updated_at: iso(),
  }
  const stock = new Map<string, { available: number; updated: string }>(
    Object.entries(DEMO_STOCK_STORE_A).map(([id, available]) => [id, { available, updated: iso() }]),
  )
  const orders: Order[] = []
  const creds = new Map<string, Credential>()
  const byQr = new Map<string, string>()
  const notifications: AppNotification[] = []
  let lastUsedQr: string | null = null

  const OPEN: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']
  const ADDRESSES = ['12 Green Park Society, Satellite', 'B-404 Shivalik Heights, Jodhpur Cross Roads', '7 Anand Nagar Society, Prahlad Nagar', '21 Shyamal Row Houses, Satellite']
  // Demo signals: rider supply is simulated here exactly as it is in the real backend (no live rider feed yet).
  const signalState: { supply: RiderSupply; weather: Weather | null } = { supply: 'NORMAL', weather: null }
  const reservedFor = (pid: string) =>
    orders.filter((o) => OPEN.includes(o.order_status)).reduce((n, o) => n + (o.items.find((i) => i.product_id === pid)?.quantity ?? 0), 0)

  function row(pid: string): InventoryRow {
    const s = stock.get(pid)!
    const reserved = reservedFor(pid)
    return { store_id: store.id, product_id: pid, available_quantity: s.available, reserved_quantity: reserved, pickable_quantity: s.available - reserved, updated_at: s.updated }
  }

  function makeOrder(lines: [string, number][], status: OrderStatus, ageMs: number, type: OrderType = 'PICKUP'): Order {
    const items: OrderItem[] = lines.map(([pid, qty]) => ({
      product_id: pid, name: CATALOGUE[pid]!.name, unit_price: CATALOGUE[pid]!.price, quantity: qty, line_total: rupees(paise(CATALOGUE[pid]!.price) * qty),
    }))
    const subtotal = items.reduce((n, i) => n + paise(i.line_total), 0)
    const discount = Math.min(2500, subtotal)
    const created = Date.now() - ageMs
    const history = [{ status: 'CREATED' as const, at: iso(created), actor_uid: 'cust', note: null }, { status: 'PLACED' as const, at: iso(created), actor_uid: 'cust', note: null }]
    return {
      id: rid(), customer_id: `cust-${rid().slice(0, 6)}`, store_id: store.id, items, subtotal: rupees(subtotal),
      pickup_discount: rupees(type === 'DELIVERY' ? 0 : discount), pickup_fee: type === 'DELIVERY' ? '0.00' : '4.00', delivery_fee: type === 'DELIVERY' && subtotal < 19900 ? '25.00' : '0.00',
      total_amount: rupees(type === 'DELIVERY' ? subtotal + (subtotal < 19900 ? 2500 : 0) : subtotal - discount), order_type: type, order_status: status,
      delivery_address: type === 'DELIVERY' ? ({ line: ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)]!, instructions: Math.random() > 0.5 ? 'Ring the bell' : null } as DeliveryAddress) : null,
      delivery_eta_minutes: type === 'DELIVERY' ? 24 : null,
      pickup_code_reference: null, idempotency_key: `k-${rid().slice(0, 8)}`, status_history: history, cancel_reason: null, accepted_at: null,
      preparing_at: null, ready_at: null, completed_at: null, cancelled_at: null, expired_at: null, expires_at: iso(created + 15 * 60_000),
      arrival_status: null, arrival_eta_minutes: null, arrival_updated_at: null, created_at: iso(created), updated_at: iso(created),
    }
  }

  function advance(o: Order, to: OrderStatus, note: string | null = null, at = Date.now()) {
    o.order_status = to
    o.status_history = [...o.status_history, { status: to, at: iso(at), actor_uid: 'mock-staff', note }]
    const field = { ACCEPTED: 'accepted_at', PREPARING: 'preparing_at', READY_FOR_PICKUP: 'ready_at', OUT_FOR_DELIVERY: 'dispatched_at', DELIVERED: 'delivered_at', COMPLETED: 'completed_at', CANCELLED: 'cancelled_at' }[to as string]
    if (field) (o as unknown as Record<string, string>)[field] = iso(at)
    o.updated_at = iso(at)
    if (to === 'READY_FOR_PICKUP' && o.order_type === 'PICKUP') issue(o)
    // Same rules as the backend: only PLACED and READY have a deadline; finished orders drop the arrival signal.
    o.expires_at = to === 'READY_FOR_PICKUP' && o.order_type === 'PICKUP' ? iso(at + 30 * 60_000) : null
    if (to === 'COMPLETED' || to === 'DELIVERED' || to === 'CANCELLED') { o.arrival_status = null; o.arrival_eta_minutes = null }
  }

  function issue(o: Order) {
    const qr = `qp1.${o.id}.${Math.floor(Date.now() / 1000) + 600}.${rid().slice(0, 8)}.mocksig`
    creds.set(o.id, { qr, otp: String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'), expiresAt: Date.now() + 600_000, used: false, attempts: 0 })
    byQr.set(qr, o.id)
    o.pickup_code_reference = o.id
  }

  function incoming() {
    const picks = Object.keys(CATALOGUE).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3))
    const lines: [string, number][] = picks.map((p) => [p, 1 + Math.floor(Math.random() * 3)])
    if (lines.some(([p, q]) => row(p).pickable_quantity < q)) return
    const type: OrderType = Math.random() < 0.34 ? 'DELIVERY' : 'PICKUP'
    const o = makeOrder(lines, 'PLACED', 0, type)
    orders.unshift(o)
    notifications.unshift({ id: rid(), title: type === 'DELIVERY' ? 'New delivery order' : 'New pickup order', body: `Order #${o.id.slice(0, 8).toUpperCase()} was placed.`, order_id: o.id, read: false, created_at: iso() })
  }

  // --- seed: history for analytics + a live board ---
  for (let d = 5; d >= 1; d--) {
    for (let k = 0; k < 2 + (d % 3); k++) {
      const o = makeOrder([['milk', 2], ['bread', 1]], 'PLACED', d * 86_400_000 - k * 3_600_000)
      const base = Date.parse(o.created_at)
      advance(o, 'ACCEPTED', null, base + 60_000)
      advance(o, 'PREPARING', null, base + 120_000)
      advance(o, 'READY_FOR_PICKUP', null, base + 120_000 + (150 + k * 40) * 1000)
      advance(o, 'COMPLETED', null, base + 900_000)
      orders.push(o)
    }
  }
  const seeds: [[string, number][], OrderStatus, number][] = [
    [[['milk', 2], ['eggs', 1]], 'PLACED', 40_000],
    [[['bread', 1], ['curd', 1], ['banana', 1]], 'PLACED', 130_000],
    [[['chips', 3]], 'ACCEPTED', 300_000],
    [[['tomato', 2], ['pav', 1]], 'PREPARING', 480_000],
    [[['cola', 2], ['milk', 1]], 'READY_FOR_PICKUP', 900_000],
  ]
  const deliverySeeds: [[string, number][], OrderStatus, number][] = [
    [[['bread', 2], ['milk', 2]], 'PREPARING', 360_000],
    [[['eggs', 1], ['tomato', 3]], 'READY_FOR_PICKUP', 600_000],
    [[['chips', 2], ['cola', 1]], 'OUT_FOR_DELIVERY', 1_100_000],
  ]
  for (const [lines, status, age] of deliverySeeds) {
    const o = makeOrder(lines, 'PLACED', age, 'DELIVERY')
    const base = Date.parse(o.created_at)
    advance(o, 'ACCEPTED', null, base + 30_000)
    if (status !== 'PREPARING' || true) advance(o, 'PREPARING', null, base + 90_000)
    if (status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY') advance(o, 'READY_FOR_PICKUP', null, base + 300_000)
    if (status === 'OUT_FOR_DELIVERY') advance(o, 'OUT_FOR_DELIVERY', null, base + 420_000)
    orders.unshift(o)
  }
  for (const [lines, status, age] of seeds) {
    const o = makeOrder(lines, 'PLACED', age)
    const base = Date.parse(o.created_at)
    if (status !== 'PLACED') advance(o, 'ACCEPTED', null, base + 30_000)
    if (status === 'PREPARING' || status === 'READY_FOR_PICKUP') advance(o, 'PREPARING', null, base + 90_000)
    if (status === 'READY_FOR_PICKUP') advance(o, 'READY_FOR_PICKUP', null, base + 300_000)
    if (status === 'ACCEPTED') { o.arrival_status = 'ON_THE_WAY'; o.arrival_eta_minutes = 6; o.arrival_updated_at = iso(Date.now() - 60_000) }
    if (status === 'READY_FOR_PICKUP') { o.arrival_status = 'ARRIVED'; o.arrival_updated_at = iso(Date.now() - 20_000) }
    orders.unshift(o)
  }
  notifications.push({ id: rid(), title: 'Welcome', body: 'Mock mode: new orders arrive about every 20 seconds.', order_id: null, read: false, created_at: iso() })
  setInterval(() => store.operating_status === 'OPEN' && store.pickup_enabled && orders.filter((o) => OPEN.includes(o.order_status)).length < 9 && incoming(), 20_000)

  function find(id: string): Order {
    const o = orders.find((x) => x.id === id)
    if (!o) throw new ApiError(404, 'not_found', 'Order not found')
    return o
  }
  function move(id: string, from: OrderStatus[], to: OrderStatus, note: string | null = null): Order {
    const o = find(id)
    if (!from.includes(o.order_status)) throw new ApiError(409, 'invalid_status_transition', `Cannot move order from ${o.order_status} to ${to}`)
    advance(o, to, note)
    if (to === 'CANCELLED') o.cancel_reason = note
    return structuredClone(o)
  }
  function complete(o: Order, c: Credential): Order {
    c.used = true
    for (const i of o.items) {
      const s = stock.get(i.product_id)!
      s.available -= i.quantity
      s.updated = iso()
    }
    advance(o, 'COMPLETED')
    return structuredClone(o)
  }
  /** Same arithmetic as the backend: supply, weather and the evening rush add up to a multiplier that stretches delivery ETAs. */
  function signals(): Signals {
    const supplyAdd = { NORMAL: 0, LOW: 0.3, VERY_LOW: 0.6 }[signalState.supply]
    const weather: Weather = signalState.weather ?? 'CLEAR'
    const weatherAdd = { CLEAR: 0, RAIN: 0.3, STORM: 0.5 }[weather]
    const multiplier = Math.min(1 + supplyAdd + weatherAdd, 1.8)
    const reasons: string[] = []
    if (signalState.supply === 'LOW') reasons.push('Few riders are available')
    if (signalState.supply === 'VERY_LOW') reasons.push('Almost no riders are available')
    if (weather === 'RAIN') reasons.push('Rain is slowing riders')
    if (weather === 'STORM') reasons.push('Storms are slowing riders')
    return {
      rider_supply: signalState.supply, weather, rush_hour: false, multiplier: multiplier.toFixed(2), surge_active: multiplier >= 1.25,
      delivery_eta_minutes: 18 + Math.round((multiplier - 1) * 30), reasons,
      sources: { rider_supply: 'simulated (set by the store; no live rider feed yet)', weather: signalState.weather ? 'override' : 'demo data', rush_hour: 'schedule' },
    }
  }
  const page = <T>(items: T[]): Page<T> => ({ items, pagination: { limit: items.length, next_cursor: null, has_more: false } })

  return {
    isMock: true,

    async getStore() { await sleep(LATENCY); return structuredClone(store) },
    async setStoreStatus(status) { await sleep(LATENCY); store.operating_status = status; store.updated_at = iso(); return structuredClone(store) },
    async setPickupEnabled(enabled) { await sleep(LATENCY); store.pickup_enabled = enabled; store.updated_at = iso(); return structuredClone(store) },

    async listOrders(opts = {}) {
      await sleep(LATENCY)
      const list = orders.filter((o) => !opts.status || o.order_status === opts.status).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return page(structuredClone(list.slice(0, opts.limit ?? 50)))
    },
    async getOrder(id) { await sleep(LATENCY / 2); return structuredClone(find(id)) },
    async acceptOrder(id) { await sleep(LATENCY); return move(id, ['PLACED'], 'ACCEPTED') },
    async rejectOrder(id, reason) { await sleep(LATENCY); return move(id, ['PLACED'], 'CANCELLED', reason ?? 'Rejected by store') },
    async startPreparation(id) { await sleep(LATENCY); return move(id, ['ACCEPTED'], 'PREPARING') },
    async markReady(id) { await sleep(LATENCY); return move(id, ['PREPARING'], 'READY_FOR_PICKUP') },
    async dispatchOrder(id) {
      await sleep(LATENCY)
      if (find(id).order_type !== 'DELIVERY') throw new ApiError(409, 'invalid_status_transition', 'This action is only for delivery orders')
      return move(id, ['READY_FOR_PICKUP'], 'OUT_FOR_DELIVERY')
    },
    async deliverOrder(id) {
      await sleep(LATENCY)
      const o = find(id)
      if (o.order_type !== 'DELIVERY') throw new ApiError(409, 'invalid_status_transition', 'Pickup orders are completed at the counter')
      if (o.order_status !== 'OUT_FOR_DELIVERY') throw new ApiError(409, 'invalid_status_transition', `Cannot move order from ${o.order_status} to DELIVERED`)
      for (const i of o.items) {
        const st = stock.get(i.product_id)!
        st.available -= i.quantity
        st.updated = iso()
      }
      advance(o, 'DELIVERED')
      return structuredClone(o)
    },
    async getSignals() { await sleep(LATENCY / 2); return signals() },
    async setSignals(riderSupply, weather) {
      await sleep(LATENCY)
      signalState.supply = riderSupply
      signalState.weather = weather
      return signals()
    },

    async verifyQr(payload) {
      await sleep(LATENCY * 2)
      if (!payload.startsWith('qp1.') || payload.split('.').length !== 5) throw new ApiError(400, 'invalid_credential', 'invalid credential')
      if (payload.includes('.wrongstore.')) throw new ApiError(403, 'credential_wrong_store', 'Credential belongs to another store')
      if (payload.includes('.expired.')) throw new ApiError(410, 'credential_expired', 'Credential expired')
      const id = byQr.get(payload)
      if (!id) throw new ApiError(400, 'invalid_credential', 'invalid credential')
      const o = find(id)
      const c = creds.get(id)!
      if (c.used) throw new ApiError(409, 'credential_already_used', 'Credential already used')
      if (Date.now() >= c.expiresAt) throw new ApiError(410, 'credential_expired', 'Credential expired')
      if (o.order_status !== 'READY_FOR_PICKUP') throw new ApiError(409, 'order_not_ready', 'Order is not ready for pickup')
      lastUsedQr = payload
      return complete(o, c)
    },
    async verifyOtp(orderId, otp) {
      await sleep(LATENCY * 2)
      const o = orders.find((x) => x.id === orderId)
      const c = creds.get(orderId)
      if (!o || !c) throw new ApiError(400, 'invalid_credential', 'invalid credential')
      if (c.used) throw new ApiError(409, 'credential_already_used', 'Credential already used')
      if (Date.now() >= c.expiresAt) throw new ApiError(410, 'credential_expired', 'Credential expired')
      if (c.attempts >= 5) throw new ApiError(429, 'too_many_attempts', 'Too many failed attempts; ask the customer to refresh the code')
      if (c.otp !== otp) { c.attempts++; throw new ApiError(400, 'invalid_credential', 'invalid credential') }
      if (o.order_status !== 'READY_FOR_PICKUP') throw new ApiError(409, 'order_not_ready', 'Order is not ready for pickup')
      lastUsedQr = c.qr
      return complete(o, c)
    },
    async pickupQueue() {
      await sleep(LATENCY)
      const now = Date.now()
      const q: QueueEntry[] = orders
        .filter((o) => OPEN.includes(o.order_status) && o.order_type === 'PICKUP')
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((o) => {
          const start = o.preparing_at ?? o.accepted_at
          const end = o.ready_at ? Date.parse(o.ready_at) : now
          return {
            order_id: o.id, order_status: o.order_status, item_count: o.items.reduce((n, i) => n + i.quantity, 0), total_amount: o.total_amount,
            placed_at: o.created_at, preparation_elapsed_seconds: start ? Math.max(0, Math.floor((end - Date.parse(start)) / 1000)) : null,
            ready_waiting_seconds: o.ready_at ? Math.max(0, Math.floor((now - Date.parse(o.ready_at)) / 1000)) : null,
            arrival_status: o.arrival_status ?? null, arrival_eta_minutes: o.arrival_eta_minutes ?? null, arrival_updated_at: o.arrival_updated_at ?? null, expires_at: o.expires_at ?? null,
          }
        })
      return q
    },

    async listInventory() { await sleep(LATENCY); return page([...stock.keys()].sort().map(row)) },
    async lowStock() { await sleep(LATENCY); return [...stock.keys()].map(row).filter((r) => r.pickable_quantity <= 5).sort((a, b) => a.pickable_quantity - b.pickable_quantity) },
    async addInventory(productId, qty) {
      await sleep(LATENCY)
      if (!CATALOGUE[productId]) throw new ApiError(404, 'not_found', 'Product not found in catalogue')
      if (stock.has(productId)) throw new ApiError(409, 'conflict', 'inventory document already exists')
      stock.set(productId, { available: qty, updated: iso() })
      return row(productId)
    },
    async setStock(productId, qty) {
      await sleep(LATENCY)
      const s = stock.get(productId)
      if (!s) throw new ApiError(404, 'not_found', 'Inventory record not found')
      const reserved = reservedFor(productId)
      if (qty < reserved) throw new ApiError(409, 'below_reserved_quantity', `Cannot set stock to ${qty}: ${reserved} units are reserved for open orders`)
      s.available = qty
      s.updated = iso()
      return row(productId)
    },
    async removeInventory(productId) {
      await sleep(LATENCY)
      if (!stock.has(productId)) throw new ApiError(404, 'not_found', 'Inventory record not found')
      if (reservedFor(productId) > 0) throw new ApiError(409, 'stock_reserved', 'Stock is reserved by open orders')
      stock.delete(productId)
    },

    async analyticsOverview(): Promise<AnalyticsOverview> {
      await sleep(LATENCY)
      const done = orders.filter((o) => o.order_status === 'COMPLETED')
      const durs = done.filter((o) => o.ready_at && o.preparing_at).map((o) => (Date.parse(o.ready_at!) - Date.parse(o.preparing_at!)) / 1000)
      return {
        total_pickups: done.length,
        avg_preparation_seconds: durs.length ? Math.round((durs.reduce((a, b) => a + b, 0) / durs.length) * 10) / 10 : null,
        total_revenue: rupees(done.reduce((n, o) => n + paise(o.total_amount), 0)),
        estimated_rider_cost_saved: rupees(done.length * 3500),
        estimate_note: 'Illustrative estimate: completed pickups x configured rider cost per delivery. Not measured data.',
      }
    },

    async listNotifications() { await sleep(LATENCY / 2); return structuredClone(notifications) },
    async markNotificationRead(id) { await sleep(60); const n = notifications.find((x) => x.id === id); if (n) n.read = true },
    async registerDevice() { await sleep(60) },

    demo: {
      credentials(): DemoCredential[] {
        return orders.filter((o) => o.order_status === 'READY_FOR_PICKUP' && creds.get(o.id)).map((o) => ({ order_id: o.id, qr_payload: creds.get(o.id)!.qr, otp: creds.get(o.id)!.otp }))
      },
      expiredQr: () => 'qp1.demo.expired.nonce0001.mocksig',
      wrongStoreQr: () => 'qp1.demo.wrongstore.nonce0001.mocksig',
      lastUsedQr: () => lastUsedQr,
    },
  }
}
