import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import type { CheckoutPreview, Order, PickupCredential } from '../api/types'
import { AuthContext, type AuthState } from '../auth/AuthContext'
import { CartProvider } from '../cart/CartContext'

export function makeApi(overrides: Partial<Api> = {}): Api {
  const unexpected = (name: string) => vi.fn(async () => { throw new Error(`unexpected api.${name}()`) })
  return {
    isMock: false,
    getMe: unexpected('getMe'),
    nearbyStores: unexpected('nearbyStores'),
    listStores: unexpected('listStores'),
    getStore: unexpected('getStore'),
    listProducts: unexpected('listProducts'),
    previewCheckout: unexpected('previewCheckout'),
    createOrder: unexpected('createOrder'),
    listOrders: unexpected('listOrders'),
    getOrder: unexpected('getOrder'),
    cancelOrder: unexpected('cancelOrder'),
    getPickupCredential: unexpected('getPickupCredential'),
    listNotifications: unexpected('listNotifications'),
    markNotificationRead: unexpected('markNotificationRead'),
    ...overrides,
  } as Api
}

export function makeAuth(user: AuthState['user'] = { uid: 'u1', email: 'a@b.c', name: 'Asha' }): AuthState {
  return {
    user, loading: false, isMock: false, configError: null,
    signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(async () => {}), getToken: vi.fn(async () => 'tok'),
  } as unknown as AuthState
}

export function renderApp(ui: ReactElement, opts: { api?: Api; auth?: AuthState; route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const api = opts.api ?? makeApi()
  const wrap = (node: ReactElement) => (
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <AuthContext.Provider value={opts.auth ?? makeAuth()}>
        <QueryClientProvider client={client}>
          <ApiProvider api={api}>
            <CartProvider>{node}</CartProvider>
          </ApiProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  )
  const result = render(wrap(ui))
  /** Re-render the tree under the SAME providers (plain `rerender` would drop them). */
  return { ...result, rerenderApp: (next: ReactElement) => result.rerender(wrap(next)) }
}

const pickupPricing = {
  subtotal: '60.00', delivery_fee: '0.00', handling_fee: '0.00', night_fee: '0.00', pickup_discount: '25.00', pickup_fee: '4.00', total_amount: '35.00',
  waived_delivery_fee: '35.00', waived_handling_fee: '9.00', waived_night_fee: '0.00',
  you_save: '69.00', rider_cost_saved: '35.00', platform_net_saving: '6.00',
}

export const previewFixture: CheckoutPreview = {
  store_id: 'store-a',
  items: [{ product_id: 'milk', name: 'Toned Milk', unit_price: '30.00', quantity: 2, line_total: '60.00' }],
  pricing: pickupPricing,
  message: 'You save ₹69 vs delivery',
  delivery: {
    ...pickupPricing, delivery_fee: '35.00', handling_fee: '9.00', pickup_discount: '0.00', pickup_fee: '0.00', total_amount: '104.00',
    waived_delivery_fee: '0.00', waived_handling_fee: '0.00', you_save: '0.00',
  },
  delivery_eta_minutes: 18,
}

export function seedCart() {
  localStorage.setItem('qp-cart-v1', JSON.stringify({
    store: { id: 'store-a', name: 'Satellite Dark Store' },
    items: [{ productId: 'milk', name: 'Toned Milk', unit: '500 ml', unitPrice: '30.00', quantity: 2, maxQty: 10 }],
  }))
}

export function orderFixture(status: Order['order_status'] = 'PLACED'): Order {
  const now = '2026-11-20T10:00:00Z'
  return {
    id: 'order-1234567890', customer_id: 'u1', store_id: 'store-a', items: previewFixture.items, subtotal: '60.00', delivery_fee: '0.00',
    pickup_discount: '25.00', pickup_fee: '4.00', total_amount: '35.00', order_type: 'PICKUP', order_status: status,
    pickup_code_reference: null, idempotency_key: 'k', status_history: [], cancel_reason: null, accepted_at: null, preparing_at: null,
    ready_at: null, completed_at: null, cancelled_at: null, expired_at: null, created_at: now, updated_at: now,
  }
}

export function credentialFixture(expiresInMs: number, n = 1): PickupCredential {
  return { order_id: 'order-1', qr_payload: `qp1.order-1.999.nonce${n}.sig`, otp: String(100000 + n), expires_at: new Date(Date.now() + expiresInMs).toISOString() }
}
