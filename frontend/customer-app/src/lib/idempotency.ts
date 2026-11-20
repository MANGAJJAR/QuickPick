import type { CartLine } from '../api/types'

/**
 * Idempotency keys for order creation. One key per distinct cart ("signature"); it survives
 * retries and page reloads (sessionStorage) so a double tap, a network retry or a refresh
 * re-sends the SAME key and the backend returns the original order instead of a second one.
 * The key is discarded only after the order is created or the cart contents change.
 */

const PREFIX = 'qp-idem:'

export function cartSignature(storeId: string, lines: CartLine[]): string {
  const sorted = [...lines].sort((a, b) => a.product_id.localeCompare(b.product_id))
  return `${storeId}|${sorted.map((l) => `${l.product_id}x${l.quantity}`).join(',')}`
}

function newKey(): string {
  return `qp-${crypto.randomUUID()}`
}

export function getOrCreateKey(signature: string): string {
  try {
    const existing = sessionStorage.getItem(PREFIX + signature)
    if (existing) return existing
    const key = newKey()
    sessionStorage.setItem(PREFIX + signature, key)
    return key
  } catch {
    return newKey() // storage blocked: still unique per call site (kept in a ref by the caller)
  }
}

export function clearKey(signature: string): void {
  try {
    sessionStorage.removeItem(PREFIX + signature)
  } catch {
    /* ignore */
  }
}
