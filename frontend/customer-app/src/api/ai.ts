import { findCategory, findProduct } from './match'
import type { ProductView } from './types'

/**
 * AI ASSISTANT ADAPTER: ***MOCK / INCOMPLETE***.
 * The backend has no AI endpoint yet (modules/ai is not implemented), so this file contains a
 * clearly marked MOCK adapter that uses a simple keyword parser against the real store catalogue.
 * It is NOT Gemini. The UI labels it "Demo parser" everywhere. When the backend ships an AI
 * endpoint, implement `AssistantAdapter` against it and flip `assistantAdapter` below.
 */

export interface AssistantSuggestion {
  product: ProductView
  quantity: number
  /** Set when the user's spelling was corrected or the item came from a category word, e.g. "mlk". */
  matchedFrom?: string
}

export interface AssistantReply {
  text: string
  suggestions: AssistantSuggestion[]
  /** Requested pickup window in minutes, if the user mentioned one (informational only). */
  pickupInMinutes: number | null
  unmatched: string[]
}

export interface AssistantAdapter {
  readonly kind: 'mock' | 'gemini'
  readonly label: string
  reply(message: string, catalogue: ProductView[]): Promise<AssistantReply>
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

/** Pure parser, exported for tests. "2 milk, bread, pickup in 10 min" -> lines + window. */
export function parseOrderText(message: string, catalogue: ProductView[]): AssistantReply {
  const windowMatch = message.match(/(?:pick\s*-?\s*up|ready)?\s*in\s+(\d{1,3})\s*(?:min|mins|minutes)\b/i)
  const pickupInMinutes = windowMatch ? Number(windowMatch[1]) : null
  const cleaned = message.replace(/(?:pick\s*-?\s*up|ready)?\s*in\s+\d{1,3}\s*(?:min|mins|minutes)\b/gi, '').replace(/\bpick\s*-?\s*up\b/gi, '')

  const suggestions: AssistantSuggestion[] = []
  const unmatched: string[] = []
  for (const raw of cleaned.split(/,|\band\b|\+|\n/i)) {
    // Drop chatty lead-ins so the quantity is at the start: "i want 2 choclate please" -> "2 choclate".
    const part = raw.toLowerCase().replace(/\b(please|pls|plz|can i have|i want|i need|give me|get me|add|order|buy)\b/g, ' ').replace(/\s+/g, ' ').trim()
    if (!part) continue
    const m = part.match(/^(?:(\d{1,2})|(a|an|one|two|three|four|five|six)\b)?\s*(?:x(?=\s|\d)\s*)?(.+)$/)
    if (!m) continue
    const quantity = m[1] ? Number(m[1]) : m[2] ? (NUMBER_WORDS[m[2]] ?? 1) : 1
    const term = (m[3] ?? '').trim()
    if (!term) continue
    const hit = findProduct(term, catalogue)
    if (hit) {
      suggestions.push({ product: hit.product, quantity: Math.max(1, quantity), matchedFrom: hit.corrected ? term : undefined })
      continue
    }
    const cat = findCategory(term, catalogue)
    if (cat) {
      for (const view of cat.items) suggestions.push({ product: view, quantity: 1, matchedFrom: `${cat.category} (“${term}”)` })
    } else {
      unmatched.push(term)
    }
  }

  const text = suggestions.length
    ? `I found ${suggestions.length} item${suggestions.length > 1 ? 's' : ''}${suggestions.some((x) => x.matchedFrom) ? ' (I fixed a few spellings for you)' : ''}. Review and add them to your cart.`
    : 'I could not find that at this store. Check the spelling, try a simpler name like "milk" or "chips", or switch store above.'
  return { text, suggestions, pickupInMinutes, unmatched }
}

export const mockAssistantAdapter: AssistantAdapter = {
  kind: 'mock',
  label: 'Demo parser (mock, not Gemini)',
  async reply(message, catalogue) {
    await new Promise((r) => setTimeout(r, 350))
    return parseOrderText(message, catalogue)
  },
}

/** Swap to a real adapter when the backend AI endpoint exists. */
export const assistantAdapter: AssistantAdapter = mockAssistantAdapter
