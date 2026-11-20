import { useState } from 'react'

/**
 * Product picture: the real photo from /products/<id>.webp when there is one, otherwise flat art: simple solid shapes in the tint's ink colour on a pastel tile. No photos, no emoji.
 * When real photography arrives, put it on the same tile with `mix-blend-mode: multiply`.
 */

export type ArtKind = 'carton' | 'egg' | 'loaf' | 'tub' | 'bowl' | 'cube' | 'tomato' | 'bag' | 'bottle' | 'jar'

const NAME_HINTS: [RegExp, ArtKind][] = [
  [/\begg/i, 'egg'],
  [/milk|lassi|chaas|buttermilk|juice|coconut water|drink(?!s)/i, 'carton'],
  [/curd|yogurt|butter|ghee|ice cream|cream/i, 'tub'],
  [/paneer|cheese|jaggery|soap|tissue|detergent|dishwash|wash|bag/i, 'cube'],
  [/bread|bun|pav|rusk|cake|khari|croissant/i, 'loaf'],
]
const CATEGORY_HINTS: Record<string, ArtKind> = {
  dairy: 'carton', bakery: 'loaf', 'fruits & veg': 'tomato', snacks: 'bag', beverages: 'bottle',
  staples: 'bowl', 'spices & sauces': 'jar', 'household & care': 'cube', frozen: 'tub',
}

export function artKind(name: string, category: string): ArtKind {
  for (const [re, kind] of NAME_HINTS) if (re.test(name)) return kind
  return CATEGORY_HINTS[category.toLowerCase()] ?? 'bag'
}

/** A tint (1 to 6) that stays the same for a given product, so milk is always the same colour. */
export function tintFor(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973
  return (h % 6) + 1
}

const TINT_BG = ['', 'bg-tint-1', 'bg-tint-2', 'bg-tint-3', 'bg-tint-4', 'bg-tint-5', 'bg-tint-6']
const TINT_INK = ['', 'text-tintink-1', 'text-tintink-2', 'text-tintink-3', 'text-tintink-4', 'text-tintink-5', 'text-tintink-6']
export const tintClasses = (tint: number) => `${TINT_BG[tint]} ${TINT_INK[tint]}`

function Shapes({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case 'carton':
      return <><path d="M22 18h20l4 8v28a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V26z" fill="currentColor" /><path d="M22 18l-4 8h28l-4-8z" fill="currentColor" opacity=".55" /><rect x="24" y="34" width="16" height="12" rx="3" fill="var(--color-surface)" opacity=".85" /></>
    case 'egg':
      return <><path d="M32 12c9 0 15 14 15 24a15 15 0 0 1-30 0c0-10 6-24 15-24z" fill="currentColor" /><ellipse cx="26" cy="30" rx="4" ry="7" fill="var(--color-surface)" opacity=".45" /></>
    case 'loaf':
      return <><path d="M12 36c0-10 8-18 20-18s20 8 20 18v12a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="currentColor" /><path d="M24 26l-4 10M33 24l-4 12M42 26l-4 10" stroke="var(--color-surface)" strokeWidth="3" strokeLinecap="round" opacity=".6" /></>
    case 'tub':
      return <><path d="M14 26h36l-4 26a3 3 0 0 1-3 2H21a3 3 0 0 1-3-2z" fill="currentColor" /><rect x="12" y="18" width="40" height="10" rx="4" fill="currentColor" opacity=".55" /><rect x="22" y="36" width="20" height="8" rx="3" fill="var(--color-surface)" opacity=".8" /></>
    case 'bowl':
      return <><path d="M10 30h44a22 22 0 0 1-44 0z" fill="currentColor" /><path d="M20 30c0-8 5-12 12-12s12 4 12 12z" fill="currentColor" opacity=".55" /><rect x="22" y="52" width="20" height="4" rx="2" fill="currentColor" /></>
    case 'cube':
      return <><path d="M32 12l20 10v22L32 54 12 44V22z" fill="currentColor" /><path d="M32 12l20 10-20 10-20-10z" fill="currentColor" opacity=".55" /><path d="M32 32v22" stroke="var(--color-surface)" strokeWidth="2.5" opacity=".6" /></>
    case 'tomato':
      return <><circle cx="32" cy="36" r="19" fill="currentColor" /><path d="M32 17c-3 3-8 4-11 3 3 4 8 5 11 4 3 1 8 0 11-4-3 1-8 0-11-3z" fill="currentColor" opacity=".55" /><ellipse cx="25" cy="32" rx="4" ry="6" fill="var(--color-surface)" opacity=".4" /></>
    case 'bag':
      return <><path d="M16 20h32l3 32a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" fill="currentColor" /><path d="M16 20l-2-4h36l-2 4z" fill="currentColor" opacity=".55" /><circle cx="32" cy="37" r="7" fill="var(--color-surface)" opacity=".8" /></>
    case 'bottle':
      return <><rect x="27" y="10" width="10" height="8" rx="2" fill="currentColor" opacity=".55" /><path d="M27 18h10v8c6 4 9 8 9 14v12a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3V40c0-6 3-10 9-14z" fill="currentColor" /><rect x="22" y="36" width="20" height="10" rx="3" fill="var(--color-surface)" opacity=".8" /></>
    case 'jar':
      return <><rect x="20" y="12" width="24" height="9" rx="3" fill="currentColor" opacity=".55" /><rect x="16" y="21" width="32" height="34" rx="9" fill="currentColor" /><rect x="22" y="31" width="20" height="13" rx="3" fill="var(--color-surface)" opacity=".8" /></>
  }
}

/**
 * The product picture on its tile. Photos sit on white (they are shot on white); a product with no photo, or whose photo
 * fails to load, falls back to flat art in the product's tint. Tiles are 14px radius inside cards.
 */
export function ProductArt({ name, category, id, className = '', dim = false }: { name: string; category: string; id: string; className?: string; dim?: boolean }) {
  const [failed, setFailed] = useState(false)
  const kind = artKind(name, category)
  if (!failed) {
    return (
      <div className={`grid place-items-center overflow-hidden rounded-[var(--radius-tile)] bg-white ${dim ? 'opacity-50' : ''} ${className}`} aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}products/${encodeURIComponent(id)}.webp`}
          alt=""
          width={480}
          height={480}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      </div>
    )
  }
  return (
    <div className={`grid place-items-center rounded-[var(--radius-tile)] ${tintClasses(tintFor(id))} ${dim ? 'opacity-50' : ''} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-[62%] w-[62%]"><Shapes kind={kind} /></svg>
    </div>
  )
}
