import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppNotification } from '../../api/types'
import { makeApi, renderApp } from '../../test/utils'
import { AlertToasts } from './AlertToasts'

const note = (id: string, title: string, read = false): AppNotification => ({
  id, title, body: 'body of ' + title, order_id: 'order-1', read, created_at: '2026-11-20T10:00:00Z',
})

describe('<AlertToasts />', () => {
  it('is silent about notifications that were already there, then pops up new ones', async () => {
    const listNotifications = vi.fn().mockResolvedValue([note('n1', 'Old news')])
    const { rerenderApp } = renderApp(<AlertToasts />, { api: makeApi({ listNotifications }) })
    await act(async () => { await Promise.resolve() })
    await vi.waitFor(() => expect(listNotifications).toHaveBeenCalled())
    expect(screen.queryByText('Old news')).not.toBeInTheDocument()

    listNotifications.mockResolvedValue([note('n2', 'Your order is ready for pickup'), note('n1', 'Old news')])
    // remounting refetches (cached [n1] first, then the new list), like the 10s poll would
    rerenderApp(<AlertToasts key="again" />)
    await vi.waitFor(() => expect(listNotifications.mock.calls.length).toBeGreaterThan(1))
    expect(await screen.findByText('Your order is ready for pickup')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View order/ })).toHaveAttribute('href', '/orders/order-1')
  })
})
