import { act, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as sound from '../lib/sound'
import { useNewOrderAlert } from '../hooks/utility'
import { makeApi, orderFixture, renderApp, storeFixture } from '../test/utils'
import { BoardPage } from './BoardPage'

function boardApi(byStatus: Record<string, ReturnType<typeof orderFixture>[]>) {
  return makeApi({
    getStore: vi.fn().mockResolvedValue(storeFixture),
    listOrders: vi.fn(async ({ status }: { status?: string } = {}) => ({ items: byStatus[status ?? ''] ?? [], pagination: null })) as never,
  })
}

describe('Board', () => {
  it('shows the status columns with counts and the right card in each', async () => {
    const api = boardApi({
      PLACED: [orderFixture('PLACED', { id: 'aaaaaaaa11' })],
      ACCEPTED: [orderFixture('ACCEPTED', { id: 'bbbbbbbb22' })],
      PREPARING: [],
      READY_FOR_PICKUP: [orderFixture('READY_FOR_PICKUP', { id: 'cccccccc33' })],
    })
    renderApp(<BoardPage />, { api })
    expect(await screen.findByText('#AAAAAAAA')).toBeInTheDocument()
    expect(screen.getByText('#BBBBBBBB')).toBeInTheDocument()
    expect(screen.getByText('#CCCCCCCC')).toBeInTheDocument()
    expect(screen.getAllByText('None')).toHaveLength(2) // empty PREPARING and OUT_FOR_DELIVERY columns
    expect(screen.getByText('Accept order')).toBeInTheDocument()
    expect(screen.getByText('Start preparing')).toBeInTheDocument()
    expect(screen.getByText('Verify pickup')).toBeInTheDocument()
  })

  it('shows "No orders right now" when everything is empty', async () => {
    renderApp(<BoardPage />, { api: boardApi({}) })
    expect(await screen.findByText('No orders right now')).toBeInTheDocument()
  })

  it('shows an error with retry when the board cannot load', async () => {
    const { ApiError } = await import('../api/client')
    const api = makeApi({ listOrders: vi.fn().mockRejectedValue(new ApiError(0, 'network_error', 'Cannot reach QuickPick')) })
    renderApp(<BoardPage />, { api })
    expect(await screen.findByText('Cannot reach QuickPick')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('new-order alert (sound + flash)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('stays silent for the first load, then chimes and flashes only for newly arrived orders', () => {
    const chime = vi.spyOn(sound, 'playNewOrderChime').mockImplementation(() => {})
    const a = orderFixture('PLACED', { id: 'a' })
    const b = orderFixture('PLACED', { id: 'b' })
    const { result, rerender } = renderHook(({ list }) => useNewOrderAlert(list), { initialProps: { list: [a] as ReturnType<typeof orderFixture>[] | undefined } })
    expect(chime).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)

    act(() => rerender({ list: [a, b] }))
    expect(chime).toHaveBeenCalledTimes(1)
    expect([...result.current]).toEqual(['b'])

    act(() => rerender({ list: [a, b] })) // same data: no new chime
    expect(chime).toHaveBeenCalledTimes(1)
  })
})
