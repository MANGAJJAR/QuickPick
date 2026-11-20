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
  it('shows a delivery-app style bill: fees struck through and FREE for pickup, then the total saving, from API values only', async () => {
    seedCart()
    const previewCheckout = vi.fn(async () => previewFixture)
    renderApp(<Page />, { api: makeApi({ previewCheckout }), route: '/checkout' })

    expect(await screen.findByTestId('you-save')).toHaveTextContent('₹69')
    const bill = screen.getByRole('region', { name: 'Bill summary' })
    expect(bill).toHaveTextContent('Item total₹60')
    expect(bill).toHaveTextContent(/Delivery fee.*₹35.*FREE/)
    expect(bill).toHaveTextContent(/Handling fee.*₹9.*FREE/)
    expect(bill).not.toHaveTextContent('Late night fee') // only shown when there is a night fee to spare
    expect(bill).toHaveTextContent('Pickup discount−₹25')
    expect(bill).toHaveTextContent(/To pay.*₹104.*₹35/) // what delivery would cost, struck through, then what you pay
    expect(screen.getByText('Savings on this order')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Place pickup order · ₹35/ })).toBeInTheDocument()
    // the client sends only ids + quantities, never prices
    expect(previewCheckout).toHaveBeenCalledWith('store-a', [{ product_id: 'milk', quantity: 2 }])
  })

  it('shows the late-night fee as spared on pickup and charged on delivery', async () => {
    seedCart()
    const night = {
      ...previewFixture,
      pricing: { ...previewFixture.pricing, waived_night_fee: '30.00', you_save: '99.00' },
      delivery: { ...previewFixture.delivery!, night_fee: '30.00', total_amount: '134.00' },
    }
    renderApp(<Page />, { api: makeApi({ previewCheckout: vi.fn(async () => night) }), route: '/checkout' })
    expect(await screen.findByTestId('you-save')).toHaveTextContent('₹99')
    expect(screen.getByRole('region', { name: 'Bill summary' })).toHaveTextContent(/Late night fee.*₹30.*FREE/)
    await userEvent.setup().click(screen.getByRole('radio', { name: /Delivery/ }))
    const bill = screen.getByRole('region', { name: 'Bill summary' })
    expect(bill).toHaveTextContent('Delivery fee₹35')
    expect(bill).toHaveTextContent('Handling fee₹9')
    expect(bill).toHaveTextContent('Late night fee₹30')
    expect(bill).toHaveTextContent('To pay₹134')
    expect(screen.queryByText('Savings on this order')).not.toBeInTheDocument() // the saving belongs to pickup
  })
})

describe('pricing errors', () => {
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
