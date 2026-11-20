/**
 * Contract check against a RUNNING backend. Skipped unless LIVE_API_URL is set, e.g.
 *   LIVE_API_URL=http://127.0.0.1:8099/api/v1 LIVE_TOKEN=customer1 LIVE_STAFF_TOKEN=staff-a npm test
 * The backend must accept those tokens (the backend test fake verifier does; real Firebase does not).
 * It exercises the real `createHttp` + `createRealApi` code the app ships.
 */
import { describe, expect, it } from 'vitest'
import { ApiError, createHttp } from './client'
import { createRealApi } from './real'

const base = process.env.LIVE_API_URL
const token = process.env.LIVE_TOKEN ?? 'customer1'
const staff = process.env.LIVE_STAFF_TOKEN ?? 'staff-a'

describe.skipIf(!base)('live backend contract', () => {
  const api = createRealApi(createHttp({ baseUrl: base!, getToken: async () => token, onUnauthorized: () => {} }))
  const staffPost = (path: string) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${staff}` } }).then((r) => r.json() as Promise<{ data: { order_status: string } }>)
  const key = () => `live-${crypto.randomUUID()}`

  it('profile, stores, nearby, products', async () => {
    expect((await api.getMe()).role).toBe('CUSTOMER')
    const stores = await api.listStores()
    expect(stores.items.map((s) => s.id).sort()).toEqual(['store-a', 'store-b'])
    const near = await api.nearbyStores(23.0258, 72.5873, 15)
    expect(near[0]?.store.id).toBe('store-a')
    expect(typeof near[0]?.distance_km).toBe('number')
    const products = await api.listProducts('store-a')
    const milk = products.items.find((p) => p.product.id === 'milk')
    expect(milk?.pickable_quantity).toBeGreaterThan(0)
    expect(typeof milk?.product.price).toBe('string') // money is a string
  })

  it('preview returns server pricing (25 INR off)', async () => {
    const p = await api.previewCheckout('store-a', [{ product_id: 'milk', quantity: 2 }])
    expect(p.pricing).toMatchObject({ subtotal: '60.00', pickup_discount: '25.00', total_amount: '35.00', you_save: '25.00' })
    expect(p.message).toBe('You save ₹25 vs delivery')
  })

  it('order lifecycle: idempotent create, track, cancel, credential gating', async () => {
    const k = key()
    const first = await api.createOrder('store-a', [{ product_id: 'milk', quantity: 1 }], k)
    const again = await api.createOrder('store-a', [{ product_id: 'milk', quantity: 1 }], k)
    expect(first.created).toBe(true)
    expect(again.created).toBe(false)
    expect(again.order.id).toBe(first.order.id)

    expect((await api.getOrder(first.order.id)).order_status).toBe('PLACED')
    expect((await api.listOrders()).items.some((o) => o.id === first.order.id)).toBe(true)
    await expect(api.getPickupCredential(first.order.id)).rejects.toMatchObject({ status: 409, code: 'order_not_ready' })

    const cancelled = await api.cancelOrder(first.order.id, 'live test')
    expect(cancelled.order_status).toBe('CANCELLED')
    await expect(api.cancelOrder(first.order.id)).rejects.toMatchObject({ status: 409, code: 'order_not_cancellable' })
  })

  it('ready order yields a QR credential; completion hides cancel path', async () => {
    const { order } = await api.createOrder('store-a', [{ product_id: 'eggs', quantity: 1 }], key())
    for (const step of ['accept', 'start-preparation', 'ready']) await staffPost(`/store/orders/${order.id}/${step}`)
    const cred = await api.getPickupCredential(order.id)
    expect(cred.qr_payload.startsWith('qp1.')).toBe(true)
    expect(cred.otp).toMatch(/^\d{6}$/)
    expect(new Date(cred.expires_at).getTime()).toBeGreaterThan(Date.now())
    const done = await fetch(`${base}/store/pickup/verify-qr`, { method: 'POST', headers: { Authorization: `Bearer ${staff}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ qr_payload: cred.qr_payload }) }).then((r) => r.json() as Promise<{ data: { order_status: string } }>)
    expect(done.data.order_status).toBe('COMPLETED')
    expect((await api.getOrder(order.id)).order_status).toBe('COMPLETED')
  })

  it('errors map to ApiError with backend codes', async () => {
    const err = (await api.createOrder('store-a', [{ product_id: 'bread', quantity: 50 }], key()).catch((e: unknown) => e)) as ApiError
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock' })
    await expect(api.getOrder('does-not-exist')).rejects.toMatchObject({ status: 404 })
  })

  it('notifications are NOT implemented by the backend (documented mismatch)', async () => {
    await expect(api.listNotifications()).rejects.toMatchObject({ status: 404 })
  })

  it('401 for a bad token', async () => {
    let called = 0
    const bad = createRealApi(createHttp({ baseUrl: base!, getToken: async () => 'nope', onUnauthorized: () => { called++ } }))
    await expect(bad.getMe()).rejects.toMatchObject({ status: 401 })
    expect(called).toBe(1)
  })
})
