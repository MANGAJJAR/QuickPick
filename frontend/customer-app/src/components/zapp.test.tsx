import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readTheme, useTheme } from '../lib/theme'
import { formatClockTime, readyBy } from '../lib/eta'
import { makeApi, previewFixture, renderApp, seedCart } from '../test/utils'
import { artKind, tintFor } from './ProductArt'
import { CartBar } from './CartBar'
import { CartSheet } from './CartSheet'

describe('product art', () => {
  it('keeps a product on the same tint every time, and picks a shape from its name or aisle', () => {
    expect(tintFor('milk')).toBe(tintFor('milk'))
    expect(new Set(['milk', 'eggs', 'bread', 'curd', 'cola', 'rice', 'soap', 'chips'].map(tintFor)).size).toBeGreaterThan(2)
    expect(artKind('Farm Eggs', 'Dairy')).toBe('egg')
    expect(artKind('Toned Milk', 'Dairy')).toBe('carton')
    expect(artKind('Brown Bread', 'Bakery')).toBe('loaf')
    expect(artKind('Bananas', 'Fruits & Veg')).toBe('tomato')
    expect(artKind('Mystery thing', 'Unknown')).toBe('bag')
  })
})

describe('ready-by clock', () => {
  it('formats local time in lowercase am/pm and adds the estimate', () => {
    const at = new Date(2026, 10, 20, 22, 21)
    expect(formatClockTime(at)).toMatch(/^10:21 pm$/)
    expect(readyBy(at, 15)).toMatch(/^10:36 pm$/)
  })
})

describe('theme', () => {
  afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme') })

  it('cycles auto, light, dark and writes data-theme (auto leaves it unset)', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.choice).toBe('auto')
    act(() => result.current.cycle())
    expect(result.current.choice).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    act(() => result.current.cycle())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    act(() => result.current.cycle())
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('remembers a forced theme', () => {
    applyTheme('dark')
    expect(readTheme()).toBe('dark')
  })
})

describe('cart bar and sheet', () => {
  const api = () => makeApi({ previewCheckout: vi.fn().mockResolvedValue(previewFixture) })

  it('floats over the tabs when the cart has items, shows the server total, and opens the sheet', async () => {
    seedCart()
    renderApp(<CartBar />, { api: api() })
    expect(screen.getByText(/2 items from Satellite Dark Store/)).toBeInTheDocument()
    expect(await screen.findByText('₹35')).toBeInTheDocument() // total_amount from the API, not computed here
    await userEvent.click(screen.getByRole('button', { name: /View cart/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Your order' })
    expect(dialog).toBeInTheDocument()
    expect(await screen.findByText(/Ready by/)).toBeInTheDocument()
  })

  it('renders nothing for an empty cart', () => {
    renderApp(<CartBar />, { api: api() })
    expect(screen.queryByText(/View cart/)).not.toBeInTheDocument()
  })

  it('closes with Escape and gives focus back to the button that opened it', async () => {
    seedCart()
    renderApp(<CartBar />, { api: api() })
    const open = screen.getByRole('button', { name: /View cart/ })
    await userEvent.click(open)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })

  it('traps Tab inside the sheet', async () => {
    seedCart()
    renderApp(<CartSheet onClose={() => {}} />, { api: api() })
    const dialog = await screen.findByRole('dialog')
    await screen.findByText(/Ready by/)
    for (let i = 0; i < 12; i++) await userEvent.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 12; i++) await userEvent.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})
