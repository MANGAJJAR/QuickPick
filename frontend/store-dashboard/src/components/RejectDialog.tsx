import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

const QUICK = ['Out of stock', 'Too busy right now', 'Item damaged']

interface Props {
  orderNumber: string
  pending: boolean
  error: string | null
  onConfirm(reason: string | undefined): void
  onCancel(): void
}

export function RejectDialog({ orderNumber, pending, error, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !pending && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="reject-title" className="anim-pop w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl">
        <h2 id="reject-title" className="text-xl font-extrabold">Reject order #{orderNumber}?</h2>
        <p className="mt-1 text-sm text-ink-soft">The customer is told it was cancelled and the reserved stock is released.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setReason(q)} className={`min-h-10 rounded-lg border-2 px-3 text-sm font-bold ${reason === q ? 'border-ink bg-ink text-white' : 'border-line'}`}>{q}</button>
          ))}
        </div>
        <label className="mt-3 block text-sm font-bold">Reason (optional)
          <textarea ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={2} className="mt-1 block w-full rounded-lg border-2 border-line p-2 text-base outline-none focus:border-ink" />
        </label>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button variant="danger" className="flex-1" loading={pending} onClick={() => onConfirm(reason.trim() || undefined)}>Reject order</Button>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>Back</Button>
        </div>
      </div>
    </div>
  )
}
