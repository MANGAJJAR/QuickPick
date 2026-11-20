import { useEffect, useRef } from 'react'
import { Button } from './ui'

interface Props {
  currentStoreName: string
  newStoreName: string
  onConfirm(): void
  onCancel(): void
}

/** Shown when the user adds an item from a different store than the one in their cart. */
export function NewCartDialog({ currentStoreName, newStoreName, onConfirm, onCancel }: Props) {
  const keepRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    keepRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="newcart-title" aria-describedby="newcart-desc" className="anim-pop w-full max-w-sm rounded-card bg-surface p-5">
        <h2 id="newcart-title" className="text-lg font-semibold">Start a new cart?</h2>
        <p id="newcart-desc" className="mt-2 text-sm text-ink-soft">
          Your cart has items from <strong className="text-ink">{currentStoreName}</strong>. A pickup order comes from one store, so adding from{' '}
          <strong className="text-ink">{newStoreName}</strong> will clear your current cart.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onConfirm}>Start new cart</Button>
          <Button ref={keepRef} variant="secondary" onClick={onCancel}>Keep current cart</Button>
        </div>
      </div>
    </div>
  )
}
