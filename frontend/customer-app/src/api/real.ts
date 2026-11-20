import type { Api } from './api'
import type { Http } from './client'
import type {
  AppNotification,
  CartLine,
  CheckoutPreview,
  Order,
  PickupCredential,
  ProductView,
  Store,
  StoreWithDistance,
  UserProfile,
} from './types'

/** Real backend implementation. Every path below exists in backend/docs/API_CONTRACTS.md. */
export function createRealApi(http: Http): Api {
  const get = <T>(path: string, query?: Record<string, string | number | undefined>) =>
    http.request<T>('GET', path, { query })

  return {
    isMock: false,

    async getMe() {
      return (await get<UserProfile>('/customers/me')).data
    },

    async nearbyStores(lat, lng, radiusKm) {
      return (await get<StoreWithDistance[]>('/customer/stores/nearby', { lat, lng, radius_km: radiusKm, limit: 30 })).data
    },

    async listStores() {
      const r = await get<Store[]>('/customer/stores', { limit: 50 })
      return { items: r.data, pagination: r.pagination }
    },

    async getStore(id) {
      return (await get<Store>(`/customer/stores/${encodeURIComponent(id)}`)).data
    },

    async listProducts(storeId, cursor) {
      const r = await get<ProductView[]>('/customer/products', { store_id: storeId, limit: 100, cursor })
      return { items: r.data, pagination: r.pagination }
    },

    async previewCheckout(storeId, items: CartLine[]) {
      return (await http.request<CheckoutPreview>('POST', '/customer/checkout/preview', { body: { store_id: storeId, items } })).data
    },

    async createOrder(storeId, items, idempotencyKey) {
      const r = await http.request<Order>('POST', '/customer/orders', {
        body: { store_id: storeId, items },
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      return { order: r.data, created: r.status === 201 }
    },

    async listOrders(cursor) {
      const r = await get<Order[]>('/customer/orders', { limit: 20, cursor })
      return { items: r.data, pagination: r.pagination }
    },

    async getOrder(id) {
      return (await get<Order>(`/customer/orders/${encodeURIComponent(id)}`)).data
    },

    async cancelOrder(id, reason) {
      return (await http.request<Order>('POST', `/customer/orders/${encodeURIComponent(id)}/cancel`, { body: reason ? { reason } : undefined })).data
    },

    async getPickupCredential(orderId) {
      return (await get<PickupCredential>(`/customer/orders/${encodeURIComponent(orderId)}/pickup-credential`)).data
    },

    // Backend does not implement these yet (docs/CUSTOMER_MODULE.md). They 404 and the UI shows an honest empty state.
    async listNotifications() {
      return (await get<AppNotification[]>('/customer/notifications')).data
    },

    async markNotificationRead(id) {
      await http.request('PATCH', `/customer/notifications/${encodeURIComponent(id)}/read`)
    },
  }
}
