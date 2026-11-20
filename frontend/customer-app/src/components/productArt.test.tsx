import { existsSync } from 'node:fs'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEMO_PRODUCTS } from '../api/demoData'
import { ProductArt } from './ProductArt'

describe('product photos', () => {
  it('shows the product photo from /products/<id>.webp', () => {
    const { container } = render(<ProductArt id="milk" name="Toned Milk" category="Dairy" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/products/milk.webp')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('falls back to flat art when the photo is missing or fails to load', () => {
    const { container } = render(<ProductArt id="new-item" name="Mystery Jar" category="Spices & Sauces" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('has a photo file for every product in the demo catalogue', () => {
    const missing = DEMO_PRODUCTS.filter((p) => !existsSync(`public/products/${p.id}.webp`)).map((p) => p.id)
    expect(missing).toEqual([])
    expect(DEMO_PRODUCTS.length).toBe(93)
  })
})
