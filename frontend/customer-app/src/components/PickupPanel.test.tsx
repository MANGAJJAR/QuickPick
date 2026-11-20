import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialFixture, makeApi, renderApp } from '../test/utils'
import { PickupPanel } from './PickupPanel'

describe('<PickupPanel />', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('shows QR + OTP with a countdown, then expires and offers a refresh that fetches a new code', async () => {
    const getPickupCredential = vi.fn()
      .mockResolvedValueOnce(credentialFixture(3000, 1))
      .mockResolvedValueOnce(credentialFixture(60_000, 2))
    renderApp(<PickupPanel orderId="order-1" status="READY_FOR_PICKUP" />, { api: makeApi({ getPickupCredential }) })

    expect(await screen.findByTestId('otp')).toHaveTextContent('100001')
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument()
    expect(screen.getByTestId('countdown')).toHaveTextContent(/Expires in 0:0[1-3]/)
    expect(getPickupCredential).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(await screen.findByText('Code expired')).toBeInTheDocument()
    expect(screen.queryByTestId('otp')).not.toBeInTheDocument() // expired credential is hidden
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()

    await act(async () => { screen.getByRole('button', { name: 'Get a new code' }).click() })
    expect(await screen.findByTestId('otp')).toHaveTextContent('100002')
    expect(getPickupCredential).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Code expired')).not.toBeInTheDocument()
  })

  it('shows the success screen and never fetches a credential once COMPLETED', () => {
    const getPickupCredential = vi.fn()
    renderApp(<PickupPanel orderId="order-1" status="COMPLETED" />, { api: makeApi({ getPickupCredential }) })
    expect(screen.getByText('Pickup complete')).toBeInTheDocument()
    expect(screen.queryByTestId('otp')).not.toBeInTheDocument()
    expect(getPickupCredential).not.toHaveBeenCalled()
  })

  it('renders nothing before the order is ready', () => {
    const getPickupCredential = vi.fn()
    const { container } = renderApp(<PickupPanel orderId="order-1" status="PREPARING" />, { api: makeApi({ getPickupCredential }) })
    expect(container).toBeEmptyDOMElement()
    expect(getPickupCredential).not.toHaveBeenCalled()
  })

  it('hides the credential when the order moves on to COMPLETED', async () => {
    const getPickupCredential = vi.fn().mockResolvedValue(credentialFixture(60_000))
    const { rerenderApp } = renderApp(<PickupPanel orderId="order-1" status="READY_FOR_PICKUP" />, { api: makeApi({ getPickupCredential }) })
    expect(await screen.findByTestId('otp')).toBeInTheDocument()
    rerenderApp(<PickupPanel orderId="order-1" status="COMPLETED" />)
    expect(screen.queryByTestId('otp')).not.toBeInTheDocument()
    expect(screen.getByText('Pickup complete')).toBeInTheDocument()
  })

  it('offers retry when the credential cannot be loaded', async () => {
    const { ApiError } = await import('../api/client')
    const getPickupCredential = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'order_not_ready', 'Order is not ready'))
      .mockResolvedValueOnce(credentialFixture(60_000))
    renderApp(<PickupPanel orderId="order-1" status="READY_FOR_PICKUP" />, { api: makeApi({ getPickupCredential }) })
    expect(await screen.findByText('Order is not ready')).toBeInTheDocument()
    await act(async () => { screen.getByRole('button', { name: 'Try again' }).click() })
    expect(await screen.findByTestId('otp')).toBeInTheDocument()
  })
})
