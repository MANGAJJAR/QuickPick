/** Display-only formatting. Prices are NEVER computed on the client; these only format API strings. */

export function formatINR(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export type StockState = { kind: 'in' | 'low' | 'out'; label: string; max: number }

/** Maps the API's pickable quantity to a UI state. `max` is how many the user may add. */
export function stockState(pickable: number | null | undefined, lowThreshold: number): StockState {
  const q = pickable ?? 0
  if (q <= 0) return { kind: 'out', label: 'Out of stock', max: 0 }
  if (q <= lowThreshold) return { kind: 'low', label: `Only ${q} left`, max: q }
  return { kind: 'in', label: 'In stock', max: q }
}
