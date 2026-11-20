import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

interface ToastApi { show(message: string): void }
const ToastContext = createContext<ToastApi>({ show: () => {} })

/** Bottom toast: black, 3 seconds. Same verb as the button ("Add" -> "Added to cart"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMessage(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 3000)
  }, [])
  const api = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center min-[960px]:bottom-8" role="status" aria-live="polite">
        {message && <p className="anim-rise rounded-xl bg-bar px-4 py-3 text-sm font-bold text-white">{message}</p>}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
