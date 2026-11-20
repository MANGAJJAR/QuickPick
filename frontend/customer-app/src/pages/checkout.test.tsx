import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { makeApi, orderFixture, previewFixture, renderApp, seedCart } from '../test/utils'
import { CheckoutPage } from './CheckoutPage'

function Page() {
  return (
    <Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders/:orderId" element={<p>order-page</p>} />
    </Routes>
  )
}

describe('checkout preview rendering', () => {
  it('shows the savings hero and the delivery vs pickup comparison from API values only', async () => {
    seedCart()
    const previewCheckout = vi.fn(async () => previewFixture)
    renderApp(<Page />, { api: makeApi({ previewCheckout }), route: '/checkout' })

    expect(await screen.findByTestId('you-save')).toHaveTextContent('₹25')
    expect(screen.getByText('You save ₹25 vs delivery')).toBeInTheDocument()
    expect(screen.getByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('QuickPick Pickup')).toBeInTheDocument()
    expect(screen.getAllByText('Estimated').length).toBeGreaterThan(0) // delivery side is labelled illustrative
    expect(screen.getByText('You pay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Place pickup order · ₹35/ })).toBeInTheDocument()
    // the client sends only ids + quantities, never prices
    expect(previewCheckout).toHaveBeenCalledWith('store-a', [{ product_id: 'milk', quantity: 2 }])
  })

  it('shows an error with retry when pricing fails', async () => {
    seedCart()
    const previewCheckout = vi.fn().mockRejectedValueOnce(new ApiError(409, 'insufficient_stock', 'Insufficient stock for Toned Milk')).mockResolvedValue(previewFixture)
    renderApp(<Page />, { api: makeApi({ previewCheckout }), route: '/checkout' })
    expect(await screen.findByText('Insufficient stock for Toned Milk')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('you-save')).toBeInTheDocument()
  })
})

describe('idempotency key', () => {
  it('reuses the SAME key when the user retries after a failed attempt, then creates one order', async () => {
    seedCart()
    const createOrder = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach QuickPick'))
      .mockResolvedValueOnce({ order: orderFixture(), created: true })
    renderApp(<Page />, { api: makeApi({ previewCheckout: async () => previewFixture, createOrder }), route: '/checkout' })
    const user = userEvent.setup()

    const button = await screen.findByRole('button', { name: /Place pickup order/ })
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(/No connection/)
    await user.click(screen.getByRole('button', { name: /Place pickup order/ }))
    expect(await screen.findByText('order-page')).toBeInTheDocument()

    expect(createOrder).toHaveBeenCalledTimes(2)
    const [firstKey, secondKey] = createOrder.mock.calls.map((c) => c[2] as string)
    expect(firstKey).toMatch(/^qp-/)
    expect(secondKey).toBe(firstKey)
  })

  it('a double tap while the request is in flight sends only one request', async () => {
    seedCart()
    let resolve!: (v: unknown) => void
    const createOrder = vi.fn(() => new Promise((r) => { resolve = r }))
    renderApp(<Page />, { api: makeApi({ previewCheckout: async () => previewFixture, createOrder: createOrder as never }), route: '/checkout' })
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: /Place pickup order/ })
    await user.dblClick(button)
    expect(createOrder).toHaveBeenCalledTimes(1)
    resolve({ order: orderFixture(), created: true })
    await waitFor(() => expect(screen.getByText('order-page')).toBeInTheDocument())
  })
})
