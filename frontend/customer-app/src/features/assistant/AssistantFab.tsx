import { lazy, Suspense, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChatIcon } from '../../components/icons'

const AssistantPanel = lazy(() => import('./AssistantPanel'))

export function AssistantFab() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  if (pathname === '/checkout' && !open) return null // keep the place-order bar clear
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-36 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white shadow-lg md:bottom-6"
          aria-label="Open shopping assistant"
        >
          <ChatIcon width={20} height={20} /> Assistant
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <AssistantPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
