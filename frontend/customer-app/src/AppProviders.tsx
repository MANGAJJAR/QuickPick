import { QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiProvider } from './api/context'
import { createHttp } from './api/client'
import { createMockApi } from './api/mock'
import { createRealApi } from './api/real'
import { useAuth } from './auth/AuthContext'
import { CartProvider } from './cart/CartContext'
import { config } from './config'
import { createQueryClient } from './hooks/queries'

/** Wires auth -> API client -> query cache -> cart. A 401 that survives a token refresh signs out and redirects to /login. */
export function AppProviders({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [queryClient] = useState(createQueryClient)

  // Refs keep the API object stable while auth/navigation identities change.
  const authRef = useRef(auth)
  authRef.current = auth
  const whereRef = useRef(location.pathname + location.search)
  whereRef.current = location.pathname + location.search

  const api = useMemo(() => {
    if (config.useMocks) return createMockApi()
    const http = createHttp({
      baseUrl: config.apiBaseUrl,
      getToken: (force) => authRef.current.getToken(force),
      onUnauthorized: () => {
        void authRef.current.signOut().finally(() => {
          queryClient.clear()
          navigate('/login', { replace: true, state: { from: whereRef.current } })
        })
      },
    })
    return createRealApi(http)
  }, [navigate, queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <CartProvider>{children}</CartProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
