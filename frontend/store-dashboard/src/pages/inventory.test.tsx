import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { validateQuantity } from '../lib/stock'
import { makeApi, renderApp, row } from '../test/utils'
import { InventoryPage } from './InventoryPage'

const rows = [row('milk', 24, 4), row('curd', 4, 1), row('bread', 9, 0), row('pav', 3, 0)]
const lowRows = [row('pav', 3, 0), row('curd', 4, 1)]

function api(extra = {}) {
  return makeApi({
    listInventory: vi.fn(async () => ({ items: rows, pagination: null })) as never,
    lowStock: vi.fn(async () => lowRows) as never,
    ...extra,
  })
}

describe('validateQuantity', () => {
  it('blocks negatives, fractions, blanks and junk', () => {
    expect(validateQuantity('5')).toEqual({ ok: true, value: 5 })
    expect(validateQuantity(' 0 ')).toEqual({ ok: true, value: 0 })
    for (const bad of ['-1', '-0.5', '1.5', '', 'abc', '1e3']) expect(validateQuantity(bad).ok).toBe(false)
    expect(validateQuantity('-3')).toMatchObject({ ok: false, reason: 'Stock cannot be negative' })
  })
})

describe('Inventory page', () => {
  it('shows available and reserved separately, with the pickable figure', async () => {
    renderApp(<InventoryPage />, { api: api() })
    expect(await screen.findByLabelText('Available 24')).toBeInTheDocument()
    expect(screen.getByLabelText('Reserved 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Pickable 20')).toBeInTheDocument()
  })

  it('blocks negative stock in the UI: error shown, Save disabled, API never called', async () => {
    const setStock = vi.fn()
    renderApp(<InventoryPage />, { api: api({ setStock }) })
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Set available quantity for milk')
    await user.clear(input)
    await user.type(input, '-5')
    const rowEl = input.closest('tr') as HTMLElement
    expect(within(rowEl).getByRole('alert')).toHaveTextContent('Stock cannot be negative')
    expect(within(rowEl).getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(input, '{Enter}')
    expect(setStock).not.toHaveBeenCalled()
  })

  it('saves a valid quantity and shows the backend error if it still rejects (below reserved)', async () => {
    const setStock = vi.fn().mockRejectedValue(new ApiError(409, 'below_reserved_quantity', 'Cannot set stock to 2: 4 units are reserved for open orders'))
    renderApp(<InventoryPage />, { api: api({ setStock }) })
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Set available quantity for milk')
    await user.clear(input)
    await user.type(input, '2')
    const rowEl = input.closest('tr') as HTMLElement
    await user.click(within(rowEl).getByRole('button', { name: 'Save' }))
    expect(setStock).toHaveBeenCalledWith('milk', 2)
    expect(await within(rowEl).findByText(/4 units are reserved for open orders/)).toBeInTheDocument()
  })

  it('low-stock tab has a visible count badge and lists only low items', async () => {
    renderApp(<InventoryPage />, { api: api() })
    const badge = await screen.findByTestId('low-stock-badge')
    await waitFor(() => expect(badge).toHaveTextContent('2'))
    await userEvent.setup().click(screen.getByRole('tab', { name: /Low stock/ }))
    expect(await screen.findAllByLabelText('Pickable 3')).toHaveLength(2) // pav and curd
    expect(screen.queryByLabelText('Pickable 20')).not.toBeInTheDocument()
  })

  it('search filters by product, and the category filter explains why it is unavailable', async () => {
    renderApp(<InventoryPage />, { api: api() })
    const user = userEvent.setup()
    await screen.findByLabelText('Available 24')
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'bre')
    expect(screen.getByText('bread')).toBeInTheDocument()
    expect(screen.queryByText('milk')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toBeDisabled()
  })

  it('remove is manager-only', async () => {
    const { unmount } = renderApp(<InventoryPage />, { api: api() })
    await screen.findByLabelText('Available 24')
    expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0)
    unmount()
    const { makeAuth } = await import('../test/utils')
    renderApp(<InventoryPage />, { api: api(), auth: makeAuth('STORE_STAFF') })
    await screen.findByLabelText('Available 24')
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('shows an empty state for no results and an error with retry', async () => {
    const listInventory = vi.fn().mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach QuickPick')).mockResolvedValue({ items: [], pagination: null })
    renderApp(<InventoryPage />, { api: api({ listInventory }) })
    expect(await screen.findByText('Cannot reach QuickPick')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No items found')).toBeInTheDocument()
  })
})
