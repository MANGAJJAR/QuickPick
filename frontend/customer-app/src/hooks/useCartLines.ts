import { useMemo } from 'react'
import type { CartLine } from '../api/types'
import { useCart } from '../cart/CartContext'

/** Cart as API lines (product_id + quantity only; prices are never sent). */
export function useCartLines(): { storeId: string | null; lines: CartLine[] } {
  const { cart } = useCart()
  return useMemo(
    () => ({ storeId: cart.store?.id ?? null, lines: cart.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })) }),
    [cart],
  )
}
