import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Signals } from '../api/types'
import { actionsFor, statusLabel } from '../lib/lifecycle'
import { makeApi, makeAuth, orderFixture, renderApp } from '../test/utils'
import { OrderActions } from './OrderActions'
import { OrderCard } from './OrderCard'
import { RiderSupplyCard } from './RiderSupplyCard'
import { StatusChip } from './StatusChip'

const delivery = (status: Parameters<typeof orderFixture>[0] = 'PREPARING') => ({
  ...orderFixture(status),
  order_type: 'DELIVERY' as const,
  delivery_address: { line: '12 Green Park Society, Satellite', instructions: 'Ring the bell' },
})

const calm: Signals = {
  rider_supply: 'NORMAL', weather: 'CLEAR', rush_hour: false, multiplier: '1.00', surge_active: false, delivery_eta_minutes: 18, reasons: [],
  sources: { rider_supply: 'simulated (set by the store; no live rider feed yet)', weather: 'open-meteo (live)', rush_hour: 'schedule' },
}

describe('delivery actions', () => {
  it('a packed delivery is sent with a rider; a packed pickup is verified at the counter', () => {
    expect(actionsFor('READY_FOR_PICKUP', 'DELIVERY').primary).toEqual({ action: 'dispatch', label: 'Send with rider' })
    expect(actionsFor('READY_FOR_PICKUP', 'PICKUP').primary).toEqual({ action: 'verify', label: 'Verify pickup' })
    expect(actionsFor('READY_FOR_PICKUP').primary?.action).toBe('verify') // default stays pickup
    expect(actionsFor('OUT_FOR_DELIVERY', 'DELIVERY').primary).toEqual({ action: 'deliver', label: 'Mark delivered' })
    expect(actionsFor('DELIVERED', 'DELIVERY').primary).toBeNull()
  })

  it('words the same status differently for deliveries', () => {
    expect(statusLabel('READY_FOR_PICKUP', 'DELIVERY')).toBe('Packed')
    expect(statusLabel('READY_FOR_PICKUP', 'PICKUP')).toBe('Ready for pickup')
    renderApp(<StatusChip status="READY_FOR_PICKUP" type="DELIVERY" />)
    expect(screen.getByText('Packed')).toBeInTheDocument()
  })

  it('"Send with rider" calls dispatch, and "Mark delivered" calls deliver', async () => {
    const dispatchOrder = vi.fn().mockResolvedValue(delivery('OUT_FOR_DELIVERY'))
    const deliverOrder = vi.fn().mockResolvedValue(delivery('DELIVERED'))
    const api = makeApi({ dispatchOrder, deliverOrder })
    const { rerenderApp } = renderApp(<OrderActions order={delivery('READY_FOR_PICKUP')} />, { api })
    await userEvent.click(screen.getByRole('button', { name: 'Send with rider' }))
    expect(dispatchOrder).toHaveBeenCalledWith('order-1234567890abcdef')
    rerenderApp(<OrderActions order={delivery('OUT_FOR_DELIVERY')} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mark delivered' }))
    expect(deliverOrder).toHaveBeenCalledWith('order-1234567890abcdef')
  })
})

describe('delivery card', () => {
  it('shows that it is a delivery and where it is going', () => {
    renderApp(<OrderCard order={delivery('PREPARING')} now={Date.now()} onOpen={() => {}} />)
    expect(screen.getByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('12 Green Park Society, Satellite')).toBeInTheDocument()
  })

  it('pickup cards do not show a delivery badge', () => {
    renderApp(<OrderCard order={orderFixture('PREPARING')} now={Date.now()} onOpen={() => {}} />)
    expect(screen.queryByText('Delivery')).not.toBeInTheDocument()
  })
})

describe('<RiderSupplyCard />', () => {
  it('lets a manager mark riders as scarce and shows the effect on delivery time and the source of the number', async () => {
    const busy: Signals = { ...calm, rider_supply: 'VERY_LOW', multiplier: '1.60', surge_active: true, delivery_eta_minutes: 36, reasons: ['Almost no riders are available'] }
    const setSignals = vi.fn().mockResolvedValue(busy)
    renderApp(<RiderSupplyCard />, { api: makeApi({ getSignals: vi.fn().mockResolvedValue(calm), setSignals }), auth: makeAuth('STORE_MANAGER') })
    expect(await screen.findByText('Riders are normal')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-eta')).toHaveTextContent('18')
    expect(screen.getByText(/simulated/)).toBeInTheDocument() // honest about the feed
    await userEvent.click(screen.getByRole('radio', { name: 'Very low' }))
    expect(setSignals).toHaveBeenCalledWith('VERY_LOW', null)
    expect(await screen.findByText('Riders are busy')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-eta')).toHaveTextContent('36')
    expect(screen.getByText('Almost no riders are available')).toBeInTheDocument()
  })

  it('is read-only for counter staff', async () => {
    renderApp(<RiderSupplyCard />, { api: makeApi({ getSignals: vi.fn().mockResolvedValue(calm) }), auth: makeAuth('STORE_STAFF') })
    await screen.findByText('Riders are normal')
    expect(screen.getByRole('radio', { name: 'Low' })).toBeDisabled()
    expect(screen.getByText('Only a store manager can change this.')).toBeInTheDocument()
  })

  it('stays out of the way on a backend without signals', async () => {
    const { ApiError } = await import('../api/client')
    const { container } = renderApp(<RiderSupplyCard />, { api: makeApi({ getSignals: vi.fn().mockRejectedValue(new ApiError(404, 'not_found', 'nope')) }) })
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
