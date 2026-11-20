import type { Api } from './api'
import type { Http } from './client'
import type {
  AppNotification,
  ArrivalInput,
  CartLine,
  Coords,
  WalkOffer,
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

    async previewCheckout(storeId, items: CartLine[], location?: Coords | null) {
      return (await http.request<CheckoutPreview>('POST', '/customer/checkout/preview', { body: { store_id: storeId, items, ...(location ? { location } : {}) } })).data
    },

    async createOrder(storeId, items, idempotencyKey, opts) {
      const res = await http.request<Order>('POST', '/customer/orders', {
        body: {
          store_id: storeId,
          items,
          fulfilment: opts?.fulfilment ?? 'PICKUP',
          ...(opts?.address ? { delivery_address: opts.address } : {}),
          ...(opts?.location ? { location: opts.location } : {}),
        },
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      return { order: res.data, created: res.status === 201 }
    },

    async getOffer(storeId, location) {
      return (await get<WalkOffer>(`/customer/stores/${encodeURIComponent(storeId)}/offer`, location ? { lat: location.lat, lng: location.lng } : undefined)).data
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

    async listNotifications() {
      return (await get<AppNotification[]>('/customer/notifications')).data
    },

    async markNotificationRead(id) {
      await http.request('PATCH', `/customer/notifications/${encodeURIComponent(id)}/read`)
    },

    async shareArrival(orderId: string, input: ArrivalInput | null) {
      const path = `/customer/orders/${encodeURIComponent(orderId)}/arrival`
      return (await http.request<Order>(input ? 'POST' : 'DELETE', path, { body: input ?? undefined })).data
    },

    async registerDevice(token: string) {
      await http.request('POST', '/customer/devices', { body: { token } })
    },
  }
}
