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
          className="fixed bottom-36 right-4 z-40 flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-brand-600 sm:w-auto sm:px-5 font-bold text-white ring-2 ring-wheat-300 transition hover:brightness-90 min-[960px]:bottom-6 min-[960px]:left-6 min-[960px]:right-auto"
          aria-label="Open shopping assistant"
        >
          <ChatIcon width={20} height={20} /> <span className="hidden sm:inline">Assistant</span>
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
