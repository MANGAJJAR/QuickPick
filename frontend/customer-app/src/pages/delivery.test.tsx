import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckoutPreview, WalkOffer } from '../api/types'
import { buildStepperModel } from '../components/OrderStepper'
import { WalkBanner } from '../components/WalkBanner'
import { makeApi, orderFixture, previewFixture, renderApp, seedCart } from '../test/utils'
import { CheckoutPage } from './CheckoutPage'

const offer = (over: Partial<WalkOffer> = {}): WalkOffer => ({
  surge_active: true, eligible: true, walk_minutes: 3, distance_m: 210, pickup_discount: '40.00',
  headline: 'Riders are busy. Walk 3 min and save ₹40', reasons: ['Rain is slowing riders'], delivery_eta_minutes: 32,
  sources: { rider_supply: 'simulated' }, ...over,
})

const both: CheckoutPreview = {
  ...previewFixture,
  pricing: { ...previewFixture.pricing, pickup_discount: '40.00', you_save: '40.00', total_amount: '20.00' },
  message: 'You save ₹40 vs delivery',
  delivery: { ...previewFixture.pricing, delivery_fee: '25.00', pickup_discount: '0.00', you_save: '0.00', total_amount: '85.00' },
  delivery_eta_minutes: 32,
  offer: offer(),
}

function Page() {
  return (
    <Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders/:orderId" element={<p>order-page</p>} />
    </Routes>
  )
}

describe('<WalkBanner />', () => {
  it('shows the server headline only when the customer can walk and riders are busy', () => {
    renderApp(<WalkBanner offer={offer()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Riders are busy. Walk 3 min and save ₹40')
    expect(screen.getByRole('status')).toHaveTextContent(/about 32 min/)
  })

  it('says only how long delivery is taking when the customer is too far or location is off', () => {
    renderApp(<WalkBanner offer={offer({ eligible: false, headline: null, walk_minutes: null, distance_m: null })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Riders are busy\./)
    expect(screen.queryByText(/Walk 3 min/)).not.toBeInTheDocument()
  })

  it('is invisible when riders are not busy', () => {
    const { container } = renderApp(<WalkBanner offer={offer({ surge_active: false, eligible: false, headline: null })} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('delivery steps', () => {
  it('walks a delivery order through packed, on the way and delivered', () => {
    const m = buildStepperModel('OUT_FOR_DELIVERY', [], 'DELIVERY')
    expect(m.steps.map((s) => s.label)).toEqual(['Placed', 'Accepted', 'Preparing', 'Packed', 'On the way', 'Delivered'])
    expect(m.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming'])
    expect(buildStepperModel('DELIVERED', [], 'DELIVERY').steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('keeps the pickup steps unchanged', () => {
    expect(buildStepperModel('READY_FOR_PICKUP').steps.map((s) => s.label)).toEqual(['Placed', 'Accepted', 'Preparing', 'Ready', 'Picked up'])
  })
})

describe('choosing delivery or pickup at checkout', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 23.027, longitude: 72.588 } }) },
    })
  })
  afterEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('offers both, defaults to pickup with the walk-in saving, and shows what each costs', async () => {
    seedCart()
    renderApp(<Page />, { api: makeApi({ previewCheckout: vi.fn(async () => both) }), route: '/checkout' })
    expect(await screen.findByRole('radio', { name: /Pickup/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Delivery/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Walk 3 min · riders are busy')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Delivery/ })).toHaveTextContent('₹85')
    expect(screen.getByRole('radio', { name: /Pickup/ })).toHaveTextContent('₹20')
    expect(screen.getByRole('button', { name: /Place pickup order · ₹20/ })).toBeInTheDocument()
  })

  it('sends the customer\'s location with a pickup order so the walk-in discount can apply', async () => {
    seedCart()
    const createOrder = vi.fn().mockResolvedValue({ order: orderFixture(), created: true })
    renderApp(<Page />, { api: makeApi({ previewCheckout: vi.fn(async () => both), createOrder }), route: '/checkout' })
    await userEvent.click(await screen.findByRole('button', { name: /Place pickup order/ }))
    await screen.findByText('order-page')
    expect(createOrder).toHaveBeenCalledWith('store-a', [{ product_id: 'milk', quantity: 2 }], expect.stringMatching(/^qp-/), {
      fulfilment: 'PICKUP', address: undefined, location: { lat: 23.027, lng: 72.588 },
    })
  })

  it('needs an address before a delivery order can be placed, then sends it', async () => {
    seedCart()
    const createOrder = vi.fn().mockResolvedValue({ order: { ...orderFixture(), order_type: 'DELIVERY' }, created: true })
    renderApp(<Page />, { api: makeApi({ previewCheckout: vi.fn(async () => both), createOrder }), route: '/checkout' })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Delivery/ }))
    const place = await screen.findByRole('button', { name: /Place delivery order · ₹85/ })
    expect(place).toBeDisabled()
    expect(screen.getByText(/Pickup would save you ₹40/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Address'), '12 Green Park, Satellite, Ahmedabad')
    await user.type(screen.getByLabelText(/Instructions for the rider/), 'Ring the bell')
    expect(place).toBeEnabled()
    await user.click(place)
    await screen.findByText('order-page')

    const [, , key, opts] = createOrder.mock.calls[0]!
    expect(key).toMatch(/^qp-/)
    expect(opts).toMatchObject({ fulfilment: 'DELIVERY', address: { line: '12 Green Park, Satellite, Ahmedabad', instructions: 'Ring the bell' } })
  })

  it('a delivery attempt never reuses the idempotency key of a pickup attempt', async () => {
    seedCart()
    const createOrder = vi.fn().mockRejectedValue(new Error('boom'))
    renderApp(<Page />, { api: makeApi({ previewCheckout: vi.fn(async () => both), createOrder }), route: '/checkout' })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Place pickup order/ }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('radio', { name: /Delivery/ }))
    await user.type(screen.getByLabelText('Address'), '12 Green Park, Satellite')
    await user.click(screen.getByRole('button', { name: /Place delivery order/ }))
    await vi.waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2))
    expect(createOrder.mock.calls[1]![2]).not.toBe(createOrder.mock.calls[0]![2])
  })
})
