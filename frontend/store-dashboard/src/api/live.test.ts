/**
 * Contract check against a RUNNING backend. Skipped unless LIVE_API_URL is set, e.g.
 *   LIVE_API_URL=http://127.0.0.1:8099/api/v1 npm test
 * Tokens (staff-a, manager-a, staff-b, customer1) are accepted by the backend's test token verifier,
 * not by real Firebase. It exercises the real `createHttp` + `createRealApi` code the app ships.
 */
import { describe, expect, it } from 'vitest'
import { createHttp } from './client'
import { createRealApi } from './real'

const base = process.env.LIVE_API_URL

const apiFor = (token: string) => createRealApi(createHttp({ baseUrl: base!, getToken: async () => token, onUnauthorized: () => {} }))

async function customer(path: string, init: { method?: string; body?: unknown; key?: string } = {}) {
  const r = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: 'Bearer customer1', 'Content-Type': 'application/json', ...(init.key ? { 'Idempotency-Key': init.key } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  return (await r.json()) as { data: Record<string, unknown> }
}

describe.skipIf(!base)('live backend contract (store dashboard)', () => {
  const staff = apiFor('staff-a')
  const manager = apiFor('manager-a')
  const other = apiFor('staff-b')

  it('store profile, status and manager-only pickup toggle', async () => {
    expect((await staff.getStore()).id).toBe('store-a')
    expect((await staff.setStoreStatus('PAUSED')).operating_status).toBe('PAUSED')
    expect((await staff.setStoreStatus('OPEN')).operating_status).toBe('OPEN')
    await expect(staff.setPickupEnabled(false)).rejects.toMatchObject({ status: 403 })
    expect((await manager.setPickupEnabled(true)).pickup_enabled).toBe(true)
  })

  it('full flow: order -> accept -> prepare -> ready -> verify QR -> completed -> inventory updated', async () => {
    const before = (await staff.listInventory()).items.find((r) => r.product_id === 'eggs')!
    const created = await customer('/customer/orders', { method: 'POST', key: `live-${crypto.randomUUID()}`, body: { store_id: 'store-a', items: [{ product_id: 'eggs', quantity: 2 }] } })
    const id = created.data.id as string

    const placed = await staff.listOrders({ status: 'PLACED' })
    expect(placed.items.some((o) => o.id === id)).toBe(true)
    await expect(other.getOrder(id)).rejects.toMatchObject({ status: 404 }) // other store cannot see it

    const reserved = (await staff.listInventory()).items.find((r) => r.product_id === 'eggs')!
    expect(reserved.reserved_quantity).toBe(before.reserved_quantity + 2)
    await expect(staff.setStock('eggs', reserved.reserved_quantity - 1)).rejects.toMatchObject({ status: 409, code: 'below_reserved_quantity' })
    await expect(staff.setStock('eggs', -1)).rejects.toMatchObject({ status: 422 })
    await expect(manager.removeInventory('eggs')).rejects.toMatchObject({ status: 409, code: 'stock_reserved' })

    await expect(staff.startPreparation(id)).rejects.toMatchObject({ status: 409, code: 'invalid_status_transition' })
    expect((await staff.acceptOrder(id)).order_status).toBe('ACCEPTED')
    expect((await staff.startPreparation(id)).order_status).toBe('PREPARING')
    expect((await staff.markReady(id)).order_status).toBe('READY_FOR_PICKUP')
    expect((await staff.pickupQueue()).some((e) => e.order_id === id && e.order_status === 'READY_FOR_PICKUP')).toBe(true)

    const cred = (await customer(`/customer/orders/${id}/pickup-credential`)).data as { qr_payload: string; otp: string }
    await expect(other.verifyQr(cred.qr_payload)).rejects.toMatchObject({ status: 403, code: 'credential_wrong_store' })
    await expect(staff.verifyOtp(id, cred.otp === '000000' ? '111111' : '000000')).rejects.toMatchObject({ status: 400, code: 'invalid_credential' })

    const done = await staff.verifyQr(cred.qr_payload)
    expect(done.order_status).toBe('COMPLETED')
    await expect(staff.verifyQr(cred.qr_payload)).rejects.toMatchObject({ status: 409, code: 'credential_already_used' })

    const after = (await staff.listInventory()).items.find((r) => r.product_id === 'eggs')!
    expect(after.available_quantity).toBe(before.available_quantity - 2)
    expect(after.reserved_quantity).toBe(before.reserved_quantity)
  })

  it('reject releases stock and only works on new orders', async () => {
    const created = await customer('/customer/orders', { method: 'POST', key: `live-${crypto.randomUUID()}`, body: { store_id: 'store-a', items: [{ product_id: 'milk', quantity: 1 }] } })
    const id = created.data.id as string
    const rejected = await staff.rejectOrder(id, 'out of ice')
    expect(rejected.order_status).toBe('CANCELLED')
    expect(rejected.cancel_reason).toBe('out of ice')
    await expect(staff.acceptOrder(id)).rejects.toMatchObject({ status: 409 })
  })

  it('inventory add/low-stock, analytics, and not-yet-implemented notifications', async () => {
    await expect(staff.addInventory('milk', 5)).rejects.toMatchObject({ status: 409 }) // already stocked
    expect(Array.isArray(await staff.lowStock())).toBe(true)
    const a = await staff.analyticsOverview()
    expect(a.total_pickups).toBeGreaterThanOrEqual(1)
    expect(typeof a.total_revenue).toBe('string')
    expect(a.estimate_note).toMatch(/Illustrative/)
    await expect(staff.listNotifications()).rejects.toMatchObject({ status: 404 }) // documented gap
  })

  it('customers are forbidden from store endpoints; bad tokens get 401', async () => {
    await expect(apiFor('customer1').getStore()).rejects.toMatchObject({ status: 403 })
    let called = 0
    const bad = createRealApi(createHttp({ baseUrl: base!, getToken: async () => 'nope', onUnauthorized: () => { called++ } }))
    await expect(bad.getStore()).rejects.toMatchObject({ status: 401 })
    expect(called).toBe(1)
  })
})
