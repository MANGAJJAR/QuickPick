import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { StoreGate } from '../auth/StoreGate'
import { analyticsFixture, makeApi, makeAuth, orderFixture, renderApp, storeFixture } from '../test/utils'
import { AnalyticsPage, buildDailySeries, buildPrepSeries } from './AnalyticsPage'

function Gated() {
  return (
    <Routes>
      <Route path="/login" element={<p>login-page</p>} />
      <Route path="/" element={<StoreGate><p>dashboard-content</p></StoreGate>} />
    </Routes>
  )
}

describe('role gate', () => {
  it.each([['CUSTOMER'], [null], ['ADMIN']])('role %s sees "Not authorized for a store" and never calls the API', async (role) => {
    const getStore = vi.fn()
    renderApp(<Gated />, { api: makeApi({ getStore }), auth: makeAuth(role) })
    expect(await screen.findByText('Not authorized for a store')).toBeInTheDocument()
    expect(screen.queryByText('dashboard-content')).not.toBeInTheDocument()
    expect(getStore).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it.each([['STORE_STAFF'], ['STORE_MANAGER']])('%s with a store passes the gate', async (role) => {
    renderApp(<Gated />, { api: makeApi({ getStore: vi.fn().mockResolvedValue(storeFixture) }), auth: makeAuth(role) })
    expect(await screen.findByText('dashboard-content')).toBeInTheDocument()
  })

  it('a backend 403 (no store assigned) shows the not-authorized screen even with a store role claim', async () => {
    const getStore = vi.fn().mockRejectedValue(new ApiError(403, 'store_claim_missing', 'No store is assigned to this account'))
    renderApp(<Gated />, { api: makeApi({ getStore }), auth: makeAuth('STORE_STAFF') })
    expect(await screen.findByText('Not authorized for a store')).toBeInTheDocument()
    expect(screen.getByText('No store is assigned to this account')).toBeInTheDocument()
  })

  it('signed-out visitors are sent to /login', async () => {
    renderApp(<Gated />, { auth: makeAuth(null, null) })
    expect(await screen.findByText('login-page')).toBeInTheDocument()
  })

  it('signing out from the not-authorized screen calls signOut', async () => {
    const auth = makeAuth('CUSTOMER')
    renderApp(<Gated />, { auth })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})

describe('analytics: measured vs illustrative', () => {
  const api = () => makeApi({
    analyticsOverview: vi.fn().mockResolvedValue(analyticsFixture),
    listOrders: vi.fn().mockResolvedValue({ items: [], pagination: null }),
  })

  it('keeps measured numbers and the estimate in separate, clearly labelled sections', async () => {
    renderApp(<AnalyticsPage />, { api: api() })
    const measured = await screen.findByTestId('measured-section')
    expect(await within(measured).findByText('12')).toBeInTheDocument() // total pickups
    expect(within(measured).getByText('3m 30s')).toBeInTheDocument() // avg prep
    expect(within(measured).getByText('₹940')).toBeInTheDocument()
    expect(within(measured).queryByText(/₹420/)).not.toBeInTheDocument() // the estimate is NOT among measured cards

    const est = await screen.findByTestId('illustrative-card')
    expect(within(est).getByText('Estimated, based on assumptions')).toBeInTheDocument()
    expect(within(est).getByText(/≈\s*₹420/)).toBeInTheDocument()
    expect(within(est).getByText(/Not measured data/)).toBeInTheDocument()
    expect(within(est).getByRole('button', { name: 'More information' })).toBeInTheDocument()
    expect(screen.getAllByText('Measured').length).toBeGreaterThan(0)
    expect(screen.getByText('Estimated')).toBeInTheDocument()
    expect(screen.queryByText(/verified savings/i, { selector: 'p, h1, h2' })).not.toBeInTheDocument()
  })

  it('the info tooltip says the estimate is not verified savings', async () => {
    renderApp(<AnalyticsPage />, { api: api() })
    const est = await screen.findByTestId('illustrative-card')
    expect(within(est).getByRole('tooltip', { hidden: true })).toHaveTextContent(/not measured and not verified savings/i)
  })

  it('shows an error with retry when analytics fail', async () => {
    const analyticsOverview = vi.fn().mockRejectedValueOnce(new ApiError(500, 'internal_error', 'Boom')).mockResolvedValue(analyticsFixture)
    renderApp(<AnalyticsPage />, { api: makeApi({ analyticsOverview, listOrders: vi.fn().mockResolvedValue({ items: [], pagination: null }) }) })
    expect(await screen.findByText('Boom')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('illustrative-card')).toBeInTheDocument())
  })
})

describe('analytics series builders', () => {
  it('groups completed and cancelled orders per day', () => {
    const now = new Date('2026-11-20T12:00:00')
    const mk = (status: 'COMPLETED' | 'CANCELLED' | 'PLACED', iso: string) => orderFixture(status, { created_at: iso })
    const series = buildDailySeries([mk('COMPLETED', '2026-11-20T09:00:00'), mk('COMPLETED', '2026-11-20T10:00:00'), mk('CANCELLED', '2026-11-19T10:00:00'), mk('PLACED', '2026-11-20T11:00:00')], 7, now)
    expect(series).toHaveLength(7)
    expect(series.at(-1)).toMatchObject({ completed: 2, cancelled: 0 })
    expect(series.at(-2)).toMatchObject({ completed: 0, cancelled: 1 })
  })

  it('computes preparation minutes only from orders with both timestamps', () => {
    const t = Date.parse('2026-11-20T10:00:00Z')
    const done = orderFixture('COMPLETED', { preparing_at: new Date(t).toISOString(), ready_at: new Date(t + 150_000).toISOString() })
    expect(buildPrepSeries([done, orderFixture('COMPLETED')])).toEqual([{ id: '#ORDE', minutes: 2.5 }])
  })
})
