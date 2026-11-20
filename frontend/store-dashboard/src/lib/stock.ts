export type QuantityCheck = { ok: true; value: number } | { ok: false; reason: string }

/** Validates a stock quantity typed by staff. Negative or fractional values never leave the browser. */
export function validateQuantity(raw: string): QuantityCheck {
  const t = raw.trim()
  if (t === '') return { ok: false, reason: 'Enter a quantity' }
  if (!/^-?\d+$/.test(t)) return { ok: false, reason: 'Whole numbers only' }
  const n = Number(t)
  if (n < 0) return { ok: false, reason: 'Stock cannot be negative' }
  if (n > 1_000_000) return { ok: false, reason: 'Too large' }
  return { ok: true, value: n }
}
