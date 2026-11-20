import { useEffect, useRef } from 'react'
import { CloseIcon } from './icons'
import { CartPanel } from './CartPanel'

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Mobile cart: a bottom sheet (24px top radius, dimmed backdrop). A real dialog: focus moves in and is trapped,
 * Escape or a backdrop tap closes it, and focus returns to whatever opened it.
 */
export function CartSheet({ onClose }: { onClose(): void }) {
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheet.current?.querySelector<HTMLElement>('button, a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !sheet.current) return
      const items = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'))
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={onClose}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        onClick={(e) => e.stopPropagation()}
        className="anim-rise relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <button onClick={onClose} aria-label="Close cart" className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface"><CloseIcon width={18} height={18} /></button>
        <CartPanel onNavigate={onClose} />
      </div>
    </div>
  )
}
