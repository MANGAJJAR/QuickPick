/** Pure cart logic (client-side cart: the backend cart endpoints are not implemented yet).
 *  Prices shown here are the API's display strings; totals always come from checkout preview. */

export interface CartStore {
  id: string
  name: string
}

export interface CartItem {
  productId: string
  name: string
  unit: string
  /** API price string, for display of the per-unit price only. */
  unitPrice: string
  quantity: number
  /** Pickable stock when the item was added; the server still validates. */
  maxQty: number
}

export interface CartState {
  store: CartStore | null
  items: CartItem[]
}

export const EMPTY_CART: CartState = { store: null, items: [] }

export type AddResult =
  | { type: 'added'; state: CartState }
  | { type: 'needs_confirm' }
  | { type: 'limit'; state: CartState }

/** Adds one unit of `item`. A cart holds a single store: adding from another store needs confirmation. */
export function addToCart(state: CartState, store: CartStore, item: Omit<CartItem, 'quantity'>): AddResult {
  if (state.store && state.store.id !== store.id && state.items.length > 0) return { type: 'needs_confirm' }
  const existing = state.items.find((i) => i.productId === item.productId)
  if (existing) {
    if (existing.quantity >= existing.maxQty) return { type: 'limit', state }
    return {
      type: 'added',
      state: { store, items: state.items.map((i) => (i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i)) },
    }
  }
  if (item.maxQty < 1) return { type: 'limit', state }
  return { type: 'added', state: { store, items: [...state.items, { ...item, quantity: 1 }] } }
}

/** Replaces the whole cart with a single item from `store` (used after "Start a new cart?"). */
export function startNewCart(store: CartStore, item: Omit<CartItem, 'quantity'>): CartState {
  return { store, items: item.maxQty < 1 ? [] : [{ ...item, quantity: 1 }] }
}

/** Adds several lines at once (assistant). `replace` starts a fresh cart for `store` first. */
export function addMany(
  state: CartState,
  store: CartStore,
  entries: { item: Omit<CartItem, 'quantity'>; quantity: number }[],
  replace: boolean,
): CartState {
  let next: CartState = replace || state.store?.id !== store.id ? { store, items: [] } : state
  for (const { item, quantity } of entries) {
    const existing = next.items.find((i) => i.productId === item.productId)
    const wanted = Math.min((existing?.quantity ?? 0) + quantity, item.maxQty)
    if (wanted < 1) continue
    next = {
      store,
      items: existing
        ? next.items.map((i) => (i.productId === item.productId ? { ...i, quantity: wanted } : i))
        : [...next.items, { ...item, quantity: wanted }],
    }
  }
  return next.items.length ? next : EMPTY_CART
}

export function setQuantity(state: CartState, productId: string, quantity: number): CartState {
  const items = state.items
    .map((i) => (i.productId === productId ? { ...i, quantity: Math.min(quantity, i.maxQty) } : i))
    .filter((i) => i.quantity > 0)
  return items.length ? { ...state, items } : EMPTY_CART
}

export function removeItem(state: CartState, productId: string): CartState {
  return setQuantity(state, productId, 0)
}

export function itemCount(state: CartState): number {
  return state.items.reduce((n, i) => n + i.quantity, 0)
}
