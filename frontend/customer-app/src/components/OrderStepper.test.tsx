import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OrderStatus, StatusEvent } from '../api/types'
import { buildStepperModel, OrderStepper } from './OrderStepper'

const ev = (status: OrderStatus): StatusEvent => ({ status, at: 't', actor_uid: null, note: null })
const states = (status: OrderStatus, history: StatusEvent[] = []) => buildStepperModel(status, history).steps.map((s) => s.state)

describe('order stepper model', () => {
  it('marks earlier steps done and the active step current', () => {
    expect(states('PLACED')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(states('PREPARING')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
    expect(states('READY_FOR_PICKUP')).toEqual(['done', 'done', 'done', 'current', 'upcoming'])
  })

  it('marks everything done once completed', () => {
    expect(states('COMPLETED')).toEqual(['done', 'done', 'done', 'done', 'done'])
  })

  it('treats CREATED as the first step', () => {
    expect(states('CREATED')[0]).toBe('current')
  })

  it('freezes at the last reached step for CANCELLED and flags the terminal state', () => {
    const m = buildStepperModel('CANCELLED', [ev('CREATED'), ev('PLACED'), ev('ACCEPTED'), ev('CANCELLED')])
    expect(m.terminal).toBe('CANCELLED')
    expect(m.steps.map((s) => s.state)).toEqual(['done', 'done', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('handles EXPIRED from READY_FOR_PICKUP', () => {
    const m = buildStepperModel('EXPIRED', [ev('PLACED'), ev('ACCEPTED'), ev('PREPARING'), ev('READY_FOR_PICKUP'), ev('EXPIRED')])
    expect(m.terminal).toBe('EXPIRED')
    expect(m.steps.filter((s) => s.state === 'done')).toHaveLength(4)
  })
})

describe('<OrderStepper />', () => {
  it('exposes the current step to assistive tech', () => {
    render(<OrderStepper status="PREPARING" />)
    const current = screen.getByRole('listitem', { current: 'step' })
    expect(current).toHaveTextContent('Preparing')
    expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
  })

  it('shows a clear message for cancelled and expired orders', () => {
    const { rerender } = render(<OrderStepper status="CANCELLED" history={[ev('PLACED')]} />)
    expect(screen.getByRole('status')).toHaveTextContent('This order was cancelled.')
    rerender(<OrderStepper status="EXPIRED" history={[ev('PLACED')]} />)
    expect(screen.getByRole('status')).toHaveTextContent('expired')
  })
})
