import type { Api } from './api'
import type { Http } from './client'
import type { AnalyticsOverview, AppNotification, InventoryRow, Order, QueueEntry, Store } from './types'

const enc = encodeURIComponent

/** Real backend implementation. Every path below exists in backend/docs/API_CONTRACTS.md. */
export function createRealApi(http: Http): Api {
  const get = <T>(path: string, query?: Record<string, string | number | undefined>) => http.request<T>('GET', path, { query })
  const post = <T>(path: string, body?: unknown) => http.request<T>('POST', path, { body })
  const patch = <T>(path: string, body?: unknown) => http.request<T>('PATCH', path, { body })

  return {
    isMock: false,

    async getStore() {
      return (await get<Store>('/store/me')).data
    },
    async setStoreStatus(status) {
      return (await patch<Store>('/store/me/status', { operating_status: status })).data
    },
    async setPickupEnabled(enabled) {
      return (await patch<Store>('/store/me/pickup-settings', { pickup_enabled: enabled })).data
    },

    async listOrders(opts = {}) {
      const r = await get<Order[]>('/store/orders', { status: opts.status, cursor: opts.cursor, limit: opts.limit ?? 50 })
      return { items: r.data, pagination: r.pagination }
    },
    async getOrder(id) {
      return (await get<Order>(`/store/orders/${enc(id)}`)).data
    },
    async acceptOrder(id) {
      return (await post<Order>(`/store/orders/${enc(id)}/accept`)).data
    },
    async rejectOrder(id, reason) {
      return (await post<Order>(`/store/orders/${enc(id)}/reject`, reason ? { reason } : undefined)).data
    },
    async startPreparation(id) {
      return (await post<Order>(`/store/orders/${enc(id)}/start-preparation`)).data
    },
    async markReady(id) {
      return (await post<Order>(`/store/orders/${enc(id)}/ready`)).data
    },

    async verifyQr(qrPayload) {
      return (await post<Order>('/store/pickup/verify-qr', { qr_payload: qrPayload })).data
    },
    async verifyOtp(orderId, otp) {
      return (await post<Order>('/store/pickup/verify-otp', { order_id: orderId, otp })).data
    },
    async pickupQueue() {
      return (await get<QueueEntry[]>('/store/pickup/queue')).data
    },

    async listInventory(cursor) {
      const r = await get<InventoryRow[]>('/store/inventory', { limit: 100, cursor })
      return { items: r.data, pagination: r.pagination }
    },
    async lowStock() {
      return (await get<InventoryRow[]>('/store/inventory/low-stock')).data
    },
    async addInventory(productId, quantity) {
      return (await post<InventoryRow>('/store/inventory', { product_id: productId, available_quantity: quantity })).data
    },
    async setStock(productId, quantity) {
      return (await patch<InventoryRow>(`/store/inventory/${enc(productId)}`, { available_quantity: quantity })).data
    },
    async removeInventory(productId) {
      await http.request('DELETE', `/store/inventory/${enc(productId)}`)
    },

    async analyticsOverview() {
      return (await get<AnalyticsOverview>('/store/analytics/overview')).data
    },

    // Not implemented by the backend yet: these 404 and the UI shows an honest "unavailable" state.
    async listNotifications() {
      return (await get<AppNotification[]>('/store/notifications')).data
    },
    async markNotificationRead(id) {
      await patch(`/store/notifications/${enc(id)}/read`)
    },
  }
}
