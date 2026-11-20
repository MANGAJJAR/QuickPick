import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NewCartDialog } from '../components/NewCartDialog'
import {
  addMany,
  addToCart,
  EMPTY_CART,
  itemCount,
  removeItem,
  setQuantity,
  startNewCart,
  type CartItem,
  type CartState,
  type CartStore,
} from './cartLogic'

const STORAGE_KEY = 'qp-cart-v1'

interface Pending {
  store: CartStore
  item: Omit<CartItem, 'quantity'>
}

export interface CartApi {
  cart: CartState
  count: number
  /** 'added' | 'limit' (max stock reached) | 'needs_confirm' (other store: dialog is shown). */
  add(store: CartStore, item: Omit<CartItem, 'quantity'>): 'added' | 'limit' | 'needs_confirm'
  /** Adds many lines at once; `replace` discards any cart from another store first. */
  addMany(store: CartStore, entries: { item: Omit<CartItem, 'quantity'>; quantity: number }[], replace?: boolean): void
  setQty(productId: string, quantity: number): void
  remove(productId: string): void
  clear(): void
}

const CartContext = createContext<CartApi | null>(null)

function load(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartState) : EMPTY_CART
  } catch {
    return EMPTY_CART
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(load)
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
    } catch {
      /* private mode: keep the in-memory cart */
    }
  }, [cart])

  const add = useCallback<CartApi['add']>(
    (store, item) => {
      const result = addToCart(cart, store, item)
      if (result.type === 'needs_confirm') {
        setPending({ store, item })
        return 'needs_confirm'
      }
      setCart(result.state)
      return result.type
    },
    [cart],
  )

  const api = useMemo<CartApi>(
    () => ({
      cart,
      count: itemCount(cart),
      add,
      addMany: (store, entries, replace = false) => setCart((c) => addMany(c, store, entries, replace)),
      setQty: (id, q) => setCart((c) => setQuantity(c, id, q)),
      remove: (id) => setCart((c) => removeItem(c, id)),
      clear: () => setCart(EMPTY_CART),
    }),
    [cart, add],
  )

  return (
    <CartContext.Provider value={api}>
      {children}
      {pending && cart.store && (
        <NewCartDialog
          currentStoreName={cart.store.name}
          newStoreName={pending.store.name}
          onConfirm={() => {
            setCart(startNewCart(pending.store, pending.item))
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </CartContext.Provider>
  )
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
