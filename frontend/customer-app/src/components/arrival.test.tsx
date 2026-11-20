import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { makeApi, orderFixture, renderApp } from '../test/utils'
import { ArrivalPanel } from './ArrivalPanel'
import { ExpiryNotice } from './ExpiryNotice'

describe('<ArrivalPanel />', () => {
  it('is hidden until the store has accepted the order', () => {
    renderApp(<ArrivalPanel order={orderFixture('PLACED')} />)
    expect(screen.queryByText('On your way?')).not.toBeInTheDocument()
  })

  it('sends "5 min away" and "I\'m here", and can withdraw the signal', async () => {
    const order = orderFixture('PREPARING')
    const shareArrival = vi.fn()
      .mockResolvedValueOnce({ ...order, arrival_status: 'ON_THE_WAY', arrival_eta_minutes: 5 })
      .mockResolvedValueOnce({ ...order, arrival_status: 'ARRIVED', arrival_eta_minutes: null })
      .mockResolvedValueOnce({ ...order, arrival_status: null, arrival_eta_minutes: null })
    const { rerenderApp } = renderApp(<ArrivalPanel order={order} />, { api: makeApi({ shareArrival }) })

    await userEvent.click(screen.getByRole('button', { name: '5 min away' }))
    expect(shareArrival).toHaveBeenLastCalledWith(order.id, { status: 'ON_THE_WAY', eta_minutes: 5 })

    rerenderApp(<ArrivalPanel order={{ ...order, arrival_status: 'ON_THE_WAY', arrival_eta_minutes: 5 }} />)
    expect(screen.getByRole('button', { name: '5 min away' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/you’re 5 min away/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'I’m here' }))
    expect(shareArrival).toHaveBeenLastCalledWith(order.id, { status: 'ARRIVED' })

    rerenderApp(<ArrivalPanel order={{ ...order, arrival_status: 'ARRIVED' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(shareArrival).toHaveBeenLastCalledWith(order.id, null)
  })

  it('shows the server\'s reason when sharing is refused', async () => {
    const shareArrival = vi.fn().mockRejectedValue(new ApiError(409, 'arrival_not_allowed', 'Too late to share your arrival'))
    renderApp(<ArrivalPanel order={orderFixture('READY_FOR_PICKUP')} />, { api: makeApi({ shareArrival }) })
    await userEvent.click(screen.getByRole('button', { name: '10 min away' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too late to share your arrival')
  })
})

describe('<ExpiryNotice />', () => {
  const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

  it('tells a customer with a ready order how long they have to collect it', () => {
    renderApp(<ExpiryNotice order={{ ...orderFixture('READY_FOR_PICKUP'), expires_at: inMinutes(12) }} />)
    expect(screen.getByRole('timer')).toHaveTextContent(/Collect within 1[12]:\d\d/)
  })

  it('explains that a placed order is released automatically if the store does not accept', () => {
    renderApp(<ExpiryNotice order={{ ...orderFixture('PLACED'), expires_at: inMinutes(14) }} />)
    expect(screen.getByRole('timer')).toHaveTextContent(/Waiting for the store to accept/)
  })

  it('shows nothing while the order is being prepared (no deadline then)', () => {
    renderApp(<ExpiryNotice order={{ ...orderFixture('PREPARING'), expires_at: null }} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('explains an expired order differently depending on whether it was ever ready', async () => {
    const { rerenderApp } = renderApp(<ExpiryNotice order={{ ...orderFixture('EXPIRED'), ready_at: null }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/didn’t accept it in time/)
    rerenderApp(<ExpiryNotice order={{ ...orderFixture('EXPIRED'), ready_at: '2026-11-20T10:30:00Z' }} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/wasn’t collected in time/))
  })
})
