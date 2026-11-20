import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Store } from '../api/types'
import { HomePage } from './HomePage'
import { makeApi, renderApp } from '../test/utils'

const mk = (id: string, name: string, address: string): Store => ({
  id, name, address, location: { lat: 23, lng: 72 }, operating_status: 'OPEN', pickup_enabled: true,
  preparation_capacity: 10, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})

describe('Home store search', () => {
  it('filters stores by name or area and shows an empty state with a way back', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) } })
    const api = makeApi({
      listStores: vi.fn().mockResolvedValue({ items: [mk('a', 'Satellite Dark Store', 'Satellite, Ahmedabad'), mk('b', 'Bopal Dark Store', 'Bopal, Ahmedabad')], pagination: null }),
    })
    renderApp(<HomePage />, { api })
    expect(await screen.findByText('Bopal Dark Store')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/search stores/i), 'satel')
    expect(screen.queryByText('Bopal Dark Store')).not.toBeInTheDocument()
    expect(screen.getByText('Satellite Dark Store')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText(/search stores/i))
    await userEvent.type(screen.getByLabelText(/search stores/i), 'zzz')
    expect(screen.getByText('No stores match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Bopal Dark Store')).toBeInTheDocument()
  })
})
