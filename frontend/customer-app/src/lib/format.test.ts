import { describe, expect, it } from 'vitest'
import { parseOrderText } from '../api/ai'
import type { ProductView } from '../api/types'
import { formatClock, formatDistance, formatINR, stockState } from './format'

describe('format', () => {
  it('formats API money strings as INR without computing', () => {
    expect(formatINR('35.00')).toBe('₹35')
    expect(formatINR('24.50')).toBe('₹24.50')
    expect(formatINR(null)).toBe('—')
    expect(formatINR('1234567.00')).toBe('₹12,34,567')
  })

  it('formats distance and countdown', () => {
    expect(formatDistance(0.85)).toBe('850 m')
    expect(formatDistance(2.04)).toBe('2.0 km')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(-5)).toBe('0:00')
  })

  it('derives stock labels from pickable quantity', () => {
    expect(stockState(10, 5)).toMatchObject({ kind: 'in', label: 'In stock', max: 10 })
    expect(stockState(3, 5)).toMatchObject({ kind: 'low', label: 'Only 3 left', max: 3 })
    expect(stockState(0, 5)).toMatchObject({ kind: 'out', label: 'Out of stock', max: 0 })
    expect(stockState(null, 5).kind).toBe('out')
  })
})

describe('mock assistant parser', () => {
  const pv = (id: string, name: string): ProductView => ({
    product: { id, name, description: '', category: 'x', image_url: null, price: '10.00', unit: 'u', is_active: true },
    store_id: 's', pickable_quantity: 5, in_stock: true,
  })
  const catalogue = [pv('milk', 'Toned Milk'), pv('bread', 'Brown Bread')]

  it('parses quantities, items and the pickup window', () => {
    const r = parseOrderText('2 milk, bread, pickup in 10 min', catalogue)
    expect(r.suggestions.map((s) => [s.product.product.id, s.quantity])).toEqual([['milk', 2], ['bread', 1]])
    expect(r.pickupInMinutes).toBe(10)
  })

  it('reports unmatched items instead of guessing', () => {
    const r = parseOrderText('3 unicorn food and milk', catalogue)
    expect(r.unmatched).toContain('unicorn food')
    expect(r.suggestions).toHaveLength(1)
  })
})
