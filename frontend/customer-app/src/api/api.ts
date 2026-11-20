import type {
  AppNotification,
  CartLine,
  CheckoutPreview,
  Order,
  Page,
  PickupCredential,
  ProductView,
  Store,
  StoreWithDistance,
  UserProfile,
} from './types'

/** Everything the UI needs from a backend. Implemented by `realApi` and `mockApi`. */
export interface Api {
  readonly isMock: boolean
  getMe(): Promise<UserProfile>
  nearbyStores(lat: number, lng: number, radiusKm: number): Promise<StoreWithDistance[]>
  listStores(): Promise<Page<Store>>
  getStore(id: string): Promise<Store>
  listProducts(storeId: string, cursor?: string): Promise<Page<ProductView>>
  previewCheckout(storeId: string, items: CartLine[]): Promise<CheckoutPreview>
  createOrder(storeId: string, items: CartLine[], idempotencyKey: string): Promise<{ order: Order; created: boolean }>
  listOrders(cursor?: string): Promise<Page<Order>>
  getOrder(id: string): Promise<Order>
  cancelOrder(id: string, reason?: string): Promise<Order>
  /** Side-effecting on the server (issues a fresh credential), so call deliberately. */
  getPickupCredential(orderId: string): Promise<PickupCredential>
  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  /** Mock mode only: simulate the store scanning the QR. */
  mockCompleteOrder?(orderId: string): Promise<void>
}
