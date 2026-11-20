import { keepPreviousData, QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import { config } from '../config'
import { TERMINAL_STATUSES, type CartLine } from '../api/types'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Retry only transient failures (network / 5xx); never 4xx.
        retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
      },
    },
  })
}

export const keys = {
  me: ['me'] as const,
  nearby: (lat: number, lng: number, r: number) => ['stores', 'nearby', lat.toFixed(3), lng.toFixed(3), r] as const,
  stores: ['stores', 'all'] as const,
  store: (id: string) => ['store', id] as const,
  products: (storeId: string) => ['products', storeId] as const,
  preview: (storeId: string, lines: CartLine[]) => ['preview', storeId, lines] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  notifications: ['notifications'] as const,
}

export function useMe(enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: keys.me, queryFn: () => api.getMe(), enabled, staleTime: 5 * 60_000 })
}

export function useNearbyStores(coords: { lat: number; lng: number } | null, radiusKm = 15) {
  const api = useApi()
  return useQuery({
    queryKey: coords ? keys.nearby(coords.lat, coords.lng, radiusKm) : ['stores', 'nearby', 'none'],
    queryFn: () => api.nearbyStores(coords!.lat, coords!.lng, radiusKm),
    enabled: coords !== null,
  })
}

export function useAllStores(enabled: boolean) {
  const api = useApi()
  return useQuery({ queryKey: keys.stores, queryFn: () => api.listStores(), enabled })
}

export function useStore(id: string) {
  const api = useApi()
  return useQuery({ queryKey: keys.store(id), queryFn: () => api.getStore(id) })
}

export function useProducts(storeId: string) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: keys.products(storeId),
    queryFn: ({ pageParam }) => api.listProducts(storeId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.pagination?.has_more ? last.pagination.next_cursor ?? undefined : undefined),
    refetchInterval: 30_000, // keep stock labels fresh while browsing
  })
}

/** Server-priced preview. The cart screen and checkout both display ONLY what this returns. */
export function usePreview(storeId: string | null, lines: CartLine[]) {
  const api = useApi()
  return useQuery({
    queryKey: keys.preview(storeId ?? '', lines),
    queryFn: () => api.previewCheckout(storeId!, lines),
    enabled: !!storeId && lines.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  })
}

export function useOrders() {
  const api = useApi()
  return useQuery({ queryKey: keys.orders, queryFn: () => api.listOrders() })
}

/** Polls every few seconds until the order reaches a terminal state. */
export function useOrder(id: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.order(id),
    queryFn: () => api.getOrder(id),
    refetchInterval: (q) => {
      const status = q.state.data?.order_status
      return status && TERMINAL_STATUSES.includes(status) ? false : config.orderPollMs
    },
    staleTime: 0,
  })
}

export function useCancelOrder(id: string) {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) => api.cancelOrder(id, reason),
    onSuccess: (order) => {
      qc.setQueryData(keys.order(id), order)
      void qc.invalidateQueries({ queryKey: keys.orders })
    },
  })
}

export function useNotifications() {
  const api = useApi()
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.listNotifications(),
    refetchInterval: 20_000,
    retry: false,
  })
}

export function useMarkNotificationRead() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  })
}
