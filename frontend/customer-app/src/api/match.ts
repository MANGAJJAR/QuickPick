import type { ProductView } from './types'

/**
 * Forgiving product matching for the assistant: typos ("mlk", "bannana", "panner"), plural forms,
 * prefixes ("choc"), common Hindi/Hinglish names ("doodh", "anda", "tamatar") and category words ("snacks").
 * Pure functions, no network.
 */

/** Everyday words people use for items in this catalogue -> the word used in the product name. */
export const ALIASES: Record<string, string> = {
  doodh: 'milk', dudh: 'milk', dahi: 'curd', dahee: 'curd', yoghurt: 'yogurt', anda: 'egg', ande: 'egg', eggs: 'egg',
  paav: 'pav', pao: 'pav', roti: 'bread', tamatar: 'tomato', tamato: 'tomato', aloo: 'potato', alu: 'potato',
  pyaz: 'onion', pyaaz: 'onion', kanda: 'onion', nimbu: 'lemon', kela: 'banana', seb: 'apple', aam: 'mango',
  chai: 'tea', namak: 'salt', cheeni: 'sugar', chini: 'sugar', chawal: 'rice', tel: 'oil', makhan: 'butter',
  pani: 'water', coke: 'cola', cocacola: 'cola', maggi: 'noodles', chips: 'chips', wafers: 'chips',
}

/** Chatty filler that is not part of a product name. */
const FILLER = new Set(['please', 'pls', 'plz', 'i', 'want', 'need', 'give', 'me', 'get', 'add', 'order', 'buy', 'some', 'of', 'the', 'to', 'my', 'cart', 'for', 'us', 'pack', 'packs', 'pcs', 'pc', 'piece', 'pieces', 'kg', 'litre', 'liter', 'bottle', 'bottles'])

export function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(stem)
}

/** Light plural handling: "biscuits" -> "biscuit", "tomatoes" -> "tomato", but keep "chips"/"peas" style words matchable. */
function stem(word: string): string {
  const aliased = ALIASES[word]
  if (aliased) return aliased
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** Optimal-string-alignment distance (insert, delete, substitute, swap adjacent letters). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
    }
  }
  return d[a.length]![b.length]!
}

/** 3 = exact, 2.5 = prefix, up to ~1.6 = typo, 0 = no match. */
export function wordScore(term: string, name: string): number {
  if (term === name) return 3
  if (term.length >= 3 && name.startsWith(term)) return 2.5
  if (name.length >= 4 && term.length >= 4 && term.startsWith(name)) return 2.5
  if (term.length < 3 || term[0] !== name[0]) return 0 // typos rarely change the first letter
  const allowed = term.length <= 5 ? 1 : term.length <= 8 ? 2 : 3
  const d = editDistance(term, name)
  return d <= allowed ? 2 - d * 0.4 : 0
}

export interface Match {
  product: ProductView
  /** True when the user's spelling was not an exact match (so the UI can say "showing X for 'mlk'"). */
  corrected: boolean
}

export function findProduct(term: string, catalogue: ProductView[]): Match | null {
  const words = normalise(term)
  if (words.length === 0) return null
  let best: { view: ProductView; score: number; exact: boolean } | null = null
  for (const view of catalogue) {
    const nameWords = normalise(view.product.name)
    let total = 0
    let matched = 0
    let exact = true
    for (const w of words) {
      const s = Math.max(0, ...nameWords.map((n) => wordScore(w, n)))
      if (s > 0) { total += s; matched++ }
      if (s < 3) exact = false
    }
    if (matched < Math.ceil(words.length / 2)) continue
    const score = total / words.length + (matched === words.length ? 0.3 : 0) + ((view.pickable_quantity ?? 0) > 0 ? 0.2 : 0)
    if (!best || score > best.score) best = { view, score, exact }
  }
  return best ? { product: best.view, corrected: !best.exact } : null
}

/** "snacks", "dairy", "frozen" ... -> up to `limit` in-stock products of that category. */
export function findCategory(term: string, catalogue: ProductView[], limit = 4): { category: string; items: ProductView[] } | null {
  const words = normalise(term)
  if (words.length === 0) return null
  const categories = [...new Set(catalogue.map((p) => p.product.category))]
  for (const cat of categories) {
    const catWords = normalise(cat)
    if (words.some((w) => catWords.some((c) => wordScore(w, c) >= 1.6))) {
      const items = catalogue.filter((p) => p.product.category === cat && (p.pickable_quantity ?? 0) > 0).slice(0, limit)
      if (items.length) return { category: cat, items }
    }
  }
  return null
}
