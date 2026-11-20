import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../api/context'
import { ApiError } from '../api/client'
import { config } from '../config'
import type { Order, StoreOperatingStatus, RiderSupply, Weather } from '../api/types'
import type { OrderAction } from '../lib/lifecycle'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 3000,
        refetchOnWindowFocus: true,
        // Retry only transient failures (network / 5xx); never 4xx.
        retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
      },
    },
  })
}

export const keys = {
  store: ['store'] as const,
  board: ['board'] as const,
  recent: ['orders', 'recent'] as const,
  order: (id: string) => ['order', id] as const,
  queue: ['queue'] as const,
  inventory: ['inventory'] as const,
  lowStock: ['inventory', 'low'] as const,
  analytics: ['analytics'] as const,
  notifications: ['notifications'] as const,
}

export function useStore(enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: keys.store, queryFn: () => api.getStore(), enabled, retry: false, staleTime: 15_000 })
}

export type Board = Record<(typeof config.boardStatuses)[number], Order[]>

/** The live board: four status-filtered lists, polled every few seconds. Oldest first (most urgent on top). */
export function useBoard() {
  const api = useApi()
  return useQuery({
    queryKey: keys.board,
    queryFn: async (): Promise<Board> => {
      const lists = await Promise.all(config.boardStatuses.map((s) => api.listOrders({ status: s, limit: 100 })))
      const out = {} as Board
      config.boardStatuses.forEach((s, i) => { out[s] = [...(lists[i]?.items ?? [])].reverse() })
      return out
    },
    refetchInterval: config.boardPollMs,
    refetchIntervalInBackground: true,
  })
}

/** Latest orders (any status, newest first). Source for today's counts and the daily chart. */
export function useRecentOrders() {
  const api = useApi()
  return useQuery({
    queryKey: keys.recent,
    queryFn: () => api.listOrders({ limit: 100 }),
    refetchInterval: config.boardPollMs * 3,
  })
}

export function useOrder(id: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: keys.order(id ?? ''),
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
    refetchInterval: config.boardPollMs,
  })
}

export function useQueue() {
  const api = useApi()
  return useQuery({ queryKey: keys.queue, queryFn: () => api.pickupQueue(), refetchInterval: config.boardPollMs })
}

/** Runs one lifecycle action through the backend. The UI never changes status locally. */
export function useOrderAction() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: OrderAction; reason?: string }): Promise<Order> => {
      switch (action) {
        case 'accept': return api.acceptOrder(id)
        case 'reject': return api.rejectOrder(id, reason)
        case 'start': return api.startPreparation(id)
        case 'ready': return api.markReady(id)
        case 'dispatch': return api.dispatchOrder(id)
        case 'deliver': return api.deliverOrder(id)
      }
    },
    onSuccess: (order) => {
      qc.setQueryData(keys.order(order.id), order) // from the response, never a local guess
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.board })
      void qc.invalidateQueries({ queryKey: keys.queue })
      void qc.invalidateQueries({ queryKey: keys.recent })
      void qc.invalidateQueries({ queryKey: keys.inventory }) // reject releases reserved stock
    },
  })
}

export function useStoreStatus() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: StoreOperatingStatus) => api.setStoreStatus(status),
    onSuccess: (store) => qc.setQueryData(keys.store, store),
  })
}

export function usePickupEnabled() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api.setPickupEnabled(enabled),
    onSuccess: (store) => qc.setQueryData(keys.store, store),
  })
}

export function useInventory() {
  const api = useApi()
  return useQuery({ queryKey: keys.inventory, queryFn: () => api.listInventory(), refetchInterval: 15_000 })
}

export function useLowStock() {
  const api = useApi()
  return useQuery({ queryKey: keys.lowStock, queryFn: () => api.lowStock(), refetchInterval: 20_000 })
}

export function useInventoryMutations() {
  const api = useApi()
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.inventory })
  }
  return {
    add: useMutation({ mutationFn: (v: { productId: string; quantity: number }) => api.addInventory(v.productId, v.quantity), onSuccess: refresh }),
    setStock: useMutation({ mutationFn: (v: { productId: string; quantity: number }) => api.setStock(v.productId, v.quantity), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (productId: string) => api.removeInventory(productId), onSuccess: refresh }),
  }
}

export function useAnalytics() {
  const api = useApi()
  return useQuery({ queryKey: keys.analytics, queryFn: () => api.analyticsOverview(), refetchInterval: 30_000 })
}

export function useNotifications() {
  const api = useApi()
  return useQuery({ queryKey: keys.notifications, queryFn: () => api.listNotifications(), refetchInterval: 6_000, retry: false })
}

export function useMarkNotificationRead() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  })
}

/** Rider supply, weather and the multiplier behind delivery ETAs and the walk-in discount. Refreshes often. */
export function useSignals() {
  const api = useApi()
  return useQuery({ queryKey: ['signals'], queryFn: () => api.getSignals(), refetchInterval: 30_000, retry: false })
}

export function useSetSignals() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ riderSupply, weather }: { riderSupply: RiderSupply; weather: Weather | null }) => api.setSignals(riderSupply, weather),
    onSuccess: (signals) => { qc.setQueryData(['signals'], signals) },
  })
}
