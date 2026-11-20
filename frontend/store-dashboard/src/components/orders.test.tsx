import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OrderStatus } from '../api/types'
import { actionsFor } from '../lib/lifecycle'
import { makeApi, orderFixture, renderApp } from '../test/utils'
import { OrderCard } from './OrderCard'

describe('actionsFor (lifecycle -> allowed actions)', () => {
  const table: [OrderStatus, string | null, string | null][] = [
    ['PLACED', 'Accept order', 'Reject'],
    ['ACCEPTED', 'Start preparing', null],
    ['PREPARING', 'Mark ready', null],
    ['READY_FOR_PICKUP', 'Verify pickup', null],
    ['COMPLETED', null, null],
    ['CANCELLED', null, null],
    ['EXPIRED', null, null],
  ]
  it.each(table)('%s -> primary %s, secondary %s', (status, primary, secondary) => {
    const a = actionsFor(status)
    expect(a.primary?.label ?? null).toBe(primary)
    expect(a.secondary?.label ?? null).toBe(secondary)
  })
})

describe('<OrderCard /> shows only the actions the lifecycle permits', () => {
  it.each([
    ['PLACED', ['Accept order', 'Reject']],
    ['ACCEPTED', ['Start preparing']],
    ['PREPARING', ['Mark ready']],
    ['READY_FOR_PICKUP', ['Verify pickup']],
  ] as [OrderStatus, string[]][])('%s', (status, labels) => {
    renderApp(<OrderCard order={orderFixture(status)} now={Date.now()} onOpen={() => {}} />)
    const all = ['Accept order', 'Reject', 'Start preparing', 'Mark ready', 'Verify pickup']
    for (const l of all) {
      if (labels.includes(l)) expect(screen.getByText(l)).toBeInTheDocument()
      else expect(screen.queryByText(l)).not.toBeInTheDocument()
    }
  })

  it('shows order number, items with quantities and time since placed', () => {
    renderApp(<OrderCard order={orderFixture('PLACED', { created_at: new Date(Date.now() - 95_000).toISOString() })} now={Date.now()} onOpen={() => {}} />)
    expect(screen.getByText('#ORDER-12')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByText('Toned Milk')).toBeInTheDocument()
    expect(screen.getByText(/1m 3\ds since placed|1m 35s since placed/)).toBeInTheDocument()
  })

  it('every status has a text label next to its colour (not colour-only)', () => {
    renderApp(<OrderCard order={orderFixture('PREPARING')} now={Date.now()} onOpen={() => {}} />)
    expect(screen.getByText('Preparing', { selector: '[data-status]' })).toBeInTheDocument()
  })

  it('has no actions for terminal orders', () => {
    renderApp(<OrderCard order={orderFixture('COMPLETED')} now={Date.now()} onOpen={() => {}} />)
    expect(screen.queryByRole('button', { name: /accept|start|ready|reject/i })).not.toBeInTheDocument()
  })
})

describe('double-submit prevention', () => {
  it('a double click sends one request and the button is disabled while in flight', async () => {
    let resolve!: (o: unknown) => void
    const acceptOrder = vi.fn(() => new Promise((r) => { resolve = r }))
    renderApp(<OrderCard order={orderFixture('PLACED')} now={Date.now()} onOpen={() => {}} />, { api: makeApi({ acceptOrder: acceptOrder as never }) })
    const user = userEvent.setup()
    const btn = screen.getByRole('button', { name: 'Accept order' })
    await user.dblClick(btn)
    expect(acceptOrder).toHaveBeenCalledTimes(1)
    expect(acceptOrder).toHaveBeenCalledWith('order-1234567890abcdef')
    expect(screen.getByRole('button', { name: /Accept order/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    resolve(orderFixture('ACCEPTED'))
    await waitFor(() => expect(acceptOrder).toHaveBeenCalledTimes(1))
  })

  it('surfaces the backend error (e.g. order already moved) and does not change status locally', async () => {
    const { ApiError } = await import('../api/client')
    const acceptOrder = vi.fn().mockRejectedValue(new ApiError(409, 'invalid_status_transition', 'Cannot move order from ACCEPTED to ACCEPTED'))
    renderApp(<OrderCard order={orderFixture('PLACED')} now={Date.now()} onOpen={() => {}} />, { api: makeApi({ acceptOrder }) })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot move order from ACCEPTED to ACCEPTED')
    expect(screen.getByRole('button', { name: 'Accept order' })).toBeEnabled() // still PLACED in the UI: only the server changes status
  })

  it('reject asks for a reason and sends it to the reject endpoint', async () => {
    const rejectOrder = vi.fn().mockResolvedValue(orderFixture('CANCELLED'))
    renderApp(<OrderCard order={orderFixture('PLACED')} now={Date.now()} onOpen={() => {}} />, { api: makeApi({ rejectOrder }) })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Out of stock' }))
    await user.click(screen.getByRole('button', { name: 'Reject order' }))
    await waitFor(() => expect(rejectOrder).toHaveBeenCalledWith('order-1234567890abcdef', 'Out of stock'))
  })
})
