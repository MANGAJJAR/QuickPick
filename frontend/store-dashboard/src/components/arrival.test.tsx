import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QueueEntry } from '../api/types'
import { QueuePage } from '../pages/QueuePage'
import { analyticsFixture, makeApi, orderFixture, renderApp } from '../test/utils'
import { ArrivalBadge } from './ArrivalBadge'
import { ExpiryChip } from './ExpiryChip'
import { OrderCard } from './OrderCard'

describe('<ArrivalBadge />', () => {
  it('says how far away the customer is, or that they are here, with text (not just colour)', () => {
    const { rerender } = renderApp(<ArrivalBadge status="ON_THE_WAY" eta={5} />)
    expect(screen.getByText('5 min away')).toBeInTheDocument()
    rerender(<ArrivalBadge status="ARRIVED" eta={null} />)
    expect(screen.getByText('Customer is here')).toBeInTheDocument()
  })

  it('renders nothing when the customer has not said anything', () => {
    const { container } = renderApp(<ArrivalBadge status={null} eta={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('<ExpiryChip />', () => {
  const now = Date.parse('2026-11-20T10:00:00Z')
  const at = (s: number) => new Date(now + s * 1000).toISOString()

  it('counts down the accept window for a new order and the collection window for a ready one', () => {
    const { rerender } = renderApp(<ExpiryChip order={{ order_status: 'PLACED', expires_at: at(600) }} now={now} />)
    expect(screen.getByText(/Accept within/)).toBeInTheDocument()
    rerender(<ExpiryChip order={{ order_status: 'READY_FOR_PICKUP', expires_at: at(1200) }} now={now} />)
    expect(screen.getByText(/Held for/)).toBeInTheDocument()
  })

  it('shows nothing for orders with no deadline', () => {
    const { container } = renderApp(<ExpiryChip order={{ order_status: 'PREPARING', expires_at: null }} now={now} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('flags an overdue order', () => {
    renderApp(<ExpiryChip order={{ order_status: 'PLACED', expires_at: at(-5) }} now={now} />)
    expect(screen.getByText(/Expiring now/)).toBeInTheDocument()
  })
})

describe('arrival on the order card', () => {
  it('shows the customer\'s ETA and the deadline on the board card', () => {
    const order = { ...orderFixture('ACCEPTED'), arrival_status: 'ON_THE_WAY' as const, arrival_eta_minutes: 4 }
    renderApp(<OrderCard order={order} now={Date.now()} onOpen={() => {}} />)
    expect(screen.getByText('4 min away')).toBeInTheDocument()
  })
})

describe('pickup queue priority', () => {
  const entry = (id: string, waiting: number, arrival: QueueEntry['arrival_status'] = null): QueueEntry => ({
    order_id: id.padEnd(8, '0'), order_status: 'READY_FOR_PICKUP', item_count: 2, total_amount: '80.00',
    placed_at: '2026-11-20T09:00:00Z', preparation_elapsed_seconds: 100, ready_waiting_seconds: waiting, arrival_status: arrival, arrival_eta_minutes: null,
  })

  it('puts customers who are here ahead of customers who have simply waited longer', async () => {
    const api = makeApi({
      pickupQueue: vi.fn().mockResolvedValue([entry('longwait', 900), entry('herenow', 60, 'ARRIVED'), entry('middle', 300)]),
      analyticsOverview: vi.fn().mockResolvedValue(analyticsFixture),
    })
    renderApp(<QueuePage />, { api })
    const rows = await screen.findAllByRole('row')
    const order = rows.slice(1).map((r) => r.textContent ?? '')
    expect(order[0]).toContain('HERENOW0')
    expect(order[0]).toContain('Customer is here')
    expect(order[1]).toContain('LONGWAIT')
    expect(order[2]).toContain('MIDDLE00')
  })
})
