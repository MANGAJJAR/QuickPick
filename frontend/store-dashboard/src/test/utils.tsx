import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import type { AnalyticsOverview, InventoryRow, Order, OrderStatus, Store } from '../api/types'
import { AuthContext, type AuthState } from '../auth/AuthContext'

export function makeApi(overrides: Partial<Api> = {}): Api {
  const unexpected = (name: string) => vi.fn(async () => { throw new Error(`unexpected api.${name}()`) })
  const names = [
    'getStore', 'setStoreStatus', 'setPickupEnabled', 'listOrders', 'getOrder', 'acceptOrder', 'rejectOrder', 'startPreparation',
    'markReady', 'verifyQr', 'verifyOtp', 'pickupQueue', 'listInventory', 'lowStock', 'addInventory', 'setStock', 'removeInventory',
    'analyticsOverview', 'listNotifications', 'markNotificationRead',
  ] as const
  const base = Object.fromEntries(names.map((n) => [n, unexpected(n)]))
  return { isMock: false, ...base, ...overrides } as unknown as Api
}

export function makeAuth(role: string | null = 'STORE_MANAGER', user: AuthState['user'] = { uid: 'u1', email: 'staff@store.test', name: 'Sam' }): AuthState {
  return {
    user, role, loading: false, isMock: false, configError: null,
    signIn: vi.fn(), signOut: vi.fn(async () => {}), getToken: vi.fn(async () => 'tok'),
  } as unknown as AuthState
}

export function renderApp(ui: ReactElement, opts: { api?: Api; auth?: AuthState; route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const api = opts.api ?? makeApi()
  const wrap = (node: ReactElement) => (
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <AuthContext.Provider value={opts.auth ?? makeAuth()}>
        <QueryClientProvider client={client}>
          <ApiProvider api={api}>{node}</ApiProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  const result = render(wrap(ui))
  /** Re-render under the SAME providers (plain `rerender` would drop them). */
  return { ...result, rerenderApp: (next: ReactElement) => result.rerender(wrap(next)) }
}

export const storeFixture: Store = {
  id: 'store-a', name: 'Satellite Dark Store', address: 'Satellite Rd', location: { lat: 23, lng: 72 },
  operating_status: 'OPEN', pickup_enabled: true, preparation_capacity: 10, created_at: '2026-11-20T08:00:00Z', updated_at: '2026-11-20T08:00:00Z',
}

export function orderFixture(status: OrderStatus = 'PLACED', over: Partial<Order> = {}): Order {
  const now = new Date().toISOString()
  return {
    id: 'order-1234567890abcdef', customer_id: 'cust-1', store_id: 'store-a',
    items: [{ product_id: 'milk', name: 'Toned Milk', unit_price: '30.00', quantity: 2, line_total: '60.00' }, { product_id: 'bread', name: 'Brown Bread', unit_price: '45.00', quantity: 1, line_total: '45.00' }],
    subtotal: '105.00', delivery_fee: '0.00', pickup_discount: '25.00', pickup_fee: '4.00', total_amount: '80.00', order_type: 'PICKUP',
    order_status: status, pickup_code_reference: null, idempotency_key: 'k', status_history: [], cancel_reason: null, accepted_at: null,
    preparing_at: null, ready_at: null, completed_at: null, cancelled_at: null, expired_at: null, created_at: now, updated_at: now, ...over,
  }
}

export function row(product_id: string, available: number, reserved = 0): InventoryRow {
  return { store_id: 'store-a', product_id, available_quantity: available, reserved_quantity: reserved, pickable_quantity: available - reserved, updated_at: new Date().toISOString() }
}

export const analyticsFixture: AnalyticsOverview = {
  total_pickups: 12, avg_preparation_seconds: 210.5, total_revenue: '940.00', estimated_rider_cost_saved: '420.00',
  estimate_note: 'Illustrative estimate: completed pickups x configured rider cost per delivery. Not measured data.',
}
