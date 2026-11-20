const EMOJI: Record<string, string> = {
  dairy: '🥛', bakery: '🍞', fruits: '🍎', fruit: '🍎', 'fruits & veg': '🥬', vegetables: '🥬', veg: '🥬', snacks: '🍿', beverages: '🧃', drinks: '🧃',
  eggs: '🥚', meat: '🍗', staples: '🌾', grocery: '🧺', household: '🧴', personal: '🧼', frozen: '🧊', sweets: '🍫',
}


export const categoryEmoji = (category: string): string => EMOJI[category.toLowerCase()] ?? '🛍️'
