import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addToCart, EMPTY_CART, setQuantity } from './cartLogic'
import { CartProvider, useCart } from './CartContext'

const A = { id: 'store-a', name: 'Satellite Store' }
const B = { id: 'store-b', name: 'Bopal Store' }
const milk = { productId: 'milk', name: 'Milk', unit: '500 ml', unitPrice: '30.00', maxQty: 3 }
const bread = { productId: 'bread', name: 'Bread', unit: '400 g', unitPrice: '45.00', maxQty: 5 }

describe('cartLogic', () => {
  it('adds, increments and respects the stock limit', () => {
    let s = EMPTY_CART
    for (let i = 0; i < 3; i++) {
      const r = addToCart(s, A, milk)
      expect(r.type).toBe('added')
      if (r.type === 'added') s = r.state
    }
    expect(s.items[0]?.quantity).toBe(3)
    expect(addToCart(s, A, milk).type).toBe('limit')
  })

  it('requires confirmation when adding from a different store', () => {
    const first = addToCart(EMPTY_CART, A, milk)
    if (first.type !== 'added') throw new Error('expected added')
    expect(addToCart(first.state, B, bread).type).toBe('needs_confirm')
  })

  it('removes a line at quantity 0 and empties the cart', () => {
    const first = addToCart(EMPTY_CART, A, milk)
    if (first.type !== 'added') throw new Error('expected added')
    expect(setQuantity(first.state, 'milk', 0)).toEqual(EMPTY_CART)
  })
})

function Probe() {
  const cart = useCart()
  return (
    <div>
      <button onClick={() => cart.add(A, milk)}>add-from-A</button>
      <button onClick={() => cart.add(B, bread)}>add-from-B</button>
      <p data-testid="state">{cart.cart.store?.id ?? 'none'}:{cart.cart.items.map((i) => `${i.productId}x${i.quantity}`).join(',')}</p>
    </div>
  )
}

describe('cross-store confirmation dialog', () => {
  it('asks before replacing the cart, and keeps it on "Keep current cart"', async () => {
    const user = userEvent.setup()
    render(<CartProvider><Probe /></CartProvider>)
    await user.click(screen.getByText('add-from-A'))
    expect(screen.getByTestId('state')).toHaveTextContent('store-a:milkx1')

    await user.click(screen.getByText('add-from-B'))
    const dialog = screen.getByRole('alertdialog', { name: 'Start a new cart?' })
    expect(within(dialog).getByText(/Satellite Store/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Bopal Store/)).toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('store-a:milkx1') // unchanged while asking

    await user.click(within(dialog).getByRole('button', { name: 'Keep current cart' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('store-a:milkx1')
  })

  it('replaces the cart on "Start new cart"', async () => {
    const user = userEvent.setup()
    render(<CartProvider><Probe /></CartProvider>)
    await user.click(screen.getByText('add-from-A'))
    await user.click(screen.getByText('add-from-B'))
    await user.click(screen.getByRole('button', { name: 'Start new cart' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('store-b:breadx1')
  })

  it('does not ask when adding from the same store', async () => {
    const user = userEvent.setup()
    render(<CartProvider><Probe /></CartProvider>)
    await user.click(screen.getByText('add-from-A'))
    await user.click(screen.getByText('add-from-A'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('store-a:milkx2')
  })
})
