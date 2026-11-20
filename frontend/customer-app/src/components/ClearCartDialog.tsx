import { useEffect, useRef } from 'react'
import { Button } from './ui'

interface Props { itemCount: number; onConfirm(): void; onCancel(): void }

/** Confirms the destructive "clear cart" action. */
export function ClearCartDialog({ itemCount, onConfirm, onCancel }: Props) {
  const keepRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    keepRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-desc" className="anim-pop w-full max-w-sm rounded-card bg-surface p-5">
        <h2 id="clear-title" className="text-lg font-extrabold">Clear your cart?</h2>
        <p id="clear-desc" className="mt-2 text-sm text-ink-soft">This removes all {itemCount} item{itemCount === 1 ? '' : 's'} from your cart.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="danger" onClick={onConfirm}>Yes, clear cart</Button>
          <Button ref={keepRef} variant="secondary" onClick={onCancel}>Keep my items</Button>
        </div>
      </div>
    </div>
  )
}
