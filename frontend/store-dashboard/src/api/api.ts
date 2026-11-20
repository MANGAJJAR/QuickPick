import type {
  AnalyticsOverview,
  AppNotification,
  InventoryRow,
  Order,
  OrderStatus,
  Page,
  QueueEntry,
  RiderSupply,
  Signals,
  Weather,
  Store,
  StoreOperatingStatus,
} from './types'

export interface DemoCredential {
  order_id: string
  qr_payload: string
  otp: string
}

/** Mock-mode-only helpers so the counter screen can be demoed without a customer's phone. */
export interface DemoHelpers {
  credentials(): DemoCredential[]
  expiredQr(): string
  wrongStoreQr(): string
  lastUsedQr(): string | null
}

/** Everything the dashboard needs from a backend. Implemented by `realApi` and `mockApi`.
 *  The store is never a parameter: the backend derives it from the auth token. */
export interface Api {
  readonly isMock: boolean
  getStore(): Promise<Store>
  setStoreStatus(status: StoreOperatingStatus): Promise<Store>
  /** Manager only (the backend enforces it). */
  setPickupEnabled(enabled: boolean): Promise<Store>

  listOrders(opts?: { status?: OrderStatus; cursor?: string; limit?: number }): Promise<Page<Order>>
  getOrder(id: string): Promise<Order>
  acceptOrder(id: string): Promise<Order>
  rejectOrder(id: string, reason?: string): Promise<Order>
  startPreparation(id: string): Promise<Order>
  markReady(id: string): Promise<Order>
  /** Delivery orders: packed -> a rider has the bag. */
  dispatchOrder(id: string): Promise<Order>
  /** Delivery orders: delivered (stock is deducted). */
  deliverOrder(id: string): Promise<Order>

  getSignals(): Promise<Signals>
  /** Manager only. Rider supply is simulated: there is no live rider feed yet. `weather: null` = use live weather. */
  setSignals(riderSupply: RiderSupply, weather: Weather | null): Promise<Signals>

  verifyQr(qrPayload: string): Promise<Order>
  verifyOtp(orderId: string, otp: string): Promise<Order>
  pickupQueue(): Promise<QueueEntry[]>

  listInventory(cursor?: string): Promise<Page<InventoryRow>>
  lowStock(): Promise<InventoryRow[]>
  addInventory(productId: string, quantity: number): Promise<InventoryRow>
  setStock(productId: string, quantity: number): Promise<InventoryRow>
  /** Manager only; blocked by the backend while units are reserved. */
  removeInventory(productId: string): Promise<void>

  analyticsOverview(): Promise<AnalyticsOverview>

  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  /** Register this device for push alerts (FCM token). */
  registerDevice(token: string): Promise<void>

  demo?: DemoHelpers
}
