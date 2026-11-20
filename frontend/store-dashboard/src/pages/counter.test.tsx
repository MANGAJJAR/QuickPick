import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createScanGate } from '../lib/scanGate'
import { describeVerifyError } from '../lib/verifyErrors'
import { makeApi, orderFixture, renderApp } from '../test/utils'
import { CounterPage } from './CounterPage'

// The camera component is replaced by a stub that fires the SAME payload three times in a row,
// like a real camera re-reading one QR code.
vi.mock('../components/QrScanner', () => ({
  default: ({ onScan }: { onScan(t: string): void }) => (
    <button onClick={() => { onScan('qp1.o.1.n.sig'); onScan('qp1.o.1.n.sig'); onScan('qp1.o.1.n.sig') }}>stub-scan-x3</button>
  ),
}))

const ready = orderFixture('READY_FOR_PICKUP', { ready_at: new Date().toISOString() })
const boardApi = (extra = {}) => makeApi({
  listOrders: vi.fn(async ({ status }: { status?: string } = {}) => ({ items: status === 'READY_FOR_PICKUP' ? [ready] : [], pagination: null })) as never,
  ...extra,
})

describe('scan gate (debounce)', () => {
  it('lets one payload through, blocks repeats inside the window and while busy', () => {
    const g = createScanGate(4000)
    expect(g.accept('A', 0)).toBe(true)
    expect(g.accept('A', 10)).toBe(false) // busy
    g.release()
    expect(g.accept('A', 1000)).toBe(false) // same code inside window
    expect(g.accept('B', 1000)).toBe(true) // different code is fine
    g.release()
    expect(g.accept('A', 6000)).toBe(true) // window elapsed
    expect(g.accept('', 7000)).toBe(false)
  })
})

describe('verification outcomes', () => {
  it('submits a camera-read QR exactly once even if the camera reads it three times', async () => {
    const verifyQr = vi.fn().mockResolvedValue(orderFixture('COMPLETED'))
    renderApp(<CounterPage />, { api: boardApi({ verifyQr }) })
    await userEvent.setup().click(await screen.findByText('stub-scan-x3'))
    expect(await screen.findByText('Handed over')).toBeInTheDocument()
    expect(verifyQr).toHaveBeenCalledTimes(1)
    expect(verifyQr).toHaveBeenCalledWith('qp1.o.1.n.sig')
  })

  it('shows a large "Handed over" confirmation with the order summary on success', async () => {
    const verifyQr = vi.fn().mockResolvedValue(orderFixture('COMPLETED'))
    renderApp(<CounterPage />, { api: boardApi({ verifyQr }) })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Handheld scanner/), 'qp1.order.123.nonce.sig')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    const done = await screen.findByRole('status')
    expect(within(done).getByText('Handed over')).toBeInTheDocument()
    expect(within(done).getByText('Order #ORDER-12')).toBeInTheDocument()
    expect(within(done).getByText('Toned Milk')).toBeInTheDocument()
    expect(within(done).getByText('₹80')).toBeInTheDocument()
    await user.click(within(done).getByRole('button', { name: 'Next customer' }))
    expect(screen.getByText('Pickup counter')).toBeInTheDocument()
  })

  it.each([
    ['credential_expired', 410, 'Code expired'],
    ['credential_already_used', 409, 'Already used'],
    ['credential_wrong_store', 403, 'Wrong store'],
    ['order_not_ready', 409, 'Order not ready'],
    ['invalid_credential', 400, 'Invalid code'],
    ['too_many_attempts', 429, 'Too many wrong attempts'],
  ])('%s -> red screen "%s"', async (code, status, title) => {
    const verifyQr = vi.fn().mockRejectedValue(new ApiError(status, code, 'backend message'))
    renderApp(<CounterPage />, { api: boardApi({ verifyQr }) })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Handheld scanner/), `qp1.x.1.n.${code}`)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(title)).toBeInTheDocument()
    expect(within(alert).getByText('Do not hand over the order.')).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Pickup counter')).toBeInTheDocument() // back to scanning
  })

  it('OTP keypad: pick the order, enter digits, verify', async () => {
    const verifyOtp = vi.fn().mockResolvedValue(orderFixture('COMPLETED'))
    renderApp(<CounterPage />, { api: boardApi({ verifyOtp }) })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /#ORDER-12/ }))
    for (const d of '482913') await user.click(screen.getByRole('button', { name: `Digit ${d}` }))
    await user.click(screen.getByRole('button', { name: 'Verify code' }))
    expect(await screen.findByText('Handed over')).toBeInTheDocument()
    expect(verifyOtp).toHaveBeenCalledWith('order-1234567890abcdef', '482913')
  })

  it('OTP verify is disabled until an order is chosen and at least 4 digits are entered', async () => {
    renderApp(<CounterPage />, { api: boardApi() })
    const user = userEvent.setup()
    const verify = await screen.findByRole('button', { name: 'Verify code' })
    expect(verify).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /#ORDER-12/ }))
    await user.click(screen.getByRole('button', { name: 'Digit 1' }))
    expect(verify).toBeDisabled()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Digit 2' }))
    await waitFor(() => expect(verify).toBeEnabled())
  })
})

describe('describeVerifyError', () => {
  it('has a specific, actionable message per backend code and a network message', () => {
    expect(describeVerifyError(new ApiError(0, 'network_error', 'x')).title).toBe('No connection')
    expect(describeVerifyError(new ApiError(410, 'credential_expired', 'x')).detail).toMatch(/new code/)
    expect(describeVerifyError(new ApiError(500, 'internal_error', 'Boom')).detail).toBe('Boom')
    expect(describeVerifyError(new Error('plain')).title).toBe('Could not verify')
  })
})
