import type {
  AppNotification,
  ArrivalInput,
  CartLine,
  Coords,
  DeliveryAddress,
  OrderType,
  WalkOffer,
  CheckoutPreview,
  Order,
  Page,
  PickupCredential,
  ProductView,
  Store,
  StoreWithDistance,
  UserProfile,
} from './types'

export interface OrderOptions {
  fulfilment?: OrderType
  /** Required for DELIVERY. */
  address?: DeliveryAddress
  /** Where the customer is now; only decides whether the walk-in discount applies. */
  location?: Coords | null
}

/** Everything the UI needs from a backend. Implemented by `realApi` and `mockApi`. */
export interface Api {
  readonly isMock: boolean
  getMe(): Promise<UserProfile>
  nearbyStores(lat: number, lng: number, radiusKm: number): Promise<StoreWithDistance[]>
  listStores(): Promise<Page<Store>>
  getStore(id: string): Promise<Store>
  listProducts(storeId: string, cursor?: string): Promise<Page<ProductView>>
  previewCheckout(storeId: string, items: CartLine[], location?: Coords | null): Promise<CheckoutPreview>
  createOrder(storeId: string, items: CartLine[], idempotencyKey: string, opts?: OrderOptions): Promise<{ order: Order; created: boolean }>
  /** Is it worth walking to this store right now? ("Riders are busy. Walk 3 min and save ₹40") */
  getOffer(storeId: string, location?: Coords | null): Promise<WalkOffer>
  listOrders(cursor?: string): Promise<Page<Order>>
  getOrder(id: string): Promise<Order>
  cancelOrder(id: string, reason?: string): Promise<Order>
  /** Side-effecting on the server (issues a fresh credential), so call deliberately. */
  getPickupCredential(orderId: string): Promise<PickupCredential>
  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  /** Tell the store "5 min away" / "I'm here"; pass null to withdraw the signal. Sends no location. */
  shareArrival(orderId: string, input: ArrivalInput | null): Promise<Order>
  /** Register this browser/phone for push notifications (FCM token). */
  registerDevice(token: string): Promise<void>
  /** Mock mode only: simulate the store scanning the QR. */
  mockCompleteOrder?(orderId: string): Promise<void>
}
