import type { Pagination } from './types'

/** Error thrown for every failed API call (network, HTTP or envelope error). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  get isNetwork(): boolean {
    return this.status === 0
  }
}

export interface HttpOptions {
  baseUrl: string
  /** Returns a bearer token; `forceRefresh` asks Firebase for a fresh one. */
  getToken: (forceRefresh?: boolean) => Promise<string | null>
  /** Called once when the user is definitively unauthenticated (401 after a token refresh). */
  onUnauthorized: () => void
  fetchImpl?: typeof fetch
}

export interface RequestInitLite {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  headers?: Record<string, string>
}

export interface HttpResult<T> {
  data: T
  pagination: Pagination | null
  status: number
}

export interface Http {
  request<T>(method: string, path: string, init?: RequestInitLite): Promise<HttpResult<T>>
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
  pagination?: Pagination
}

function buildUrl(baseUrl: string, path: string, query?: RequestInitLite['query']): string {
  const url = new URL(baseUrl.replace(/\/$/, '') + path, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

/** Thin fetch wrapper: bearer auth, envelope unwrapping, one token-refresh retry on 401. */
export function createHttp(opts: HttpOptions): Http {
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function send(method: string, path: string, init: RequestInitLite | undefined, forceRefresh: boolean) {
    const token = await opts.getToken(forceRefresh)
    const headers: Record<string, string> = { Accept: 'application/json', ...init?.headers }
    if (token) headers.Authorization = `Bearer ${token}`
    if (init?.body !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await doFetch(buildUrl(opts.baseUrl, path, init?.query), {
        method,
        headers,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
    } catch {
      throw new ApiError(0, 'network_error', 'Cannot reach QuickPick. Check your connection and try again.')
    }
  }

  async function request<T>(method: string, path: string, init?: RequestInitLite): Promise<HttpResult<T>> {
    let res = await send(method, path, init, false)
    if (res.status === 401) {
      res = await send(method, path, init, true) // token may simply have expired
      if (res.status === 401) {
        opts.onUnauthorized()
        throw new ApiError(401, 'unauthorized', 'Your session has expired. Please sign in again.')
      }
    }
    let body: Envelope<T> | null = null
    try {
      body = (await res.json()) as Envelope<T>
    } catch {
      body = null
    }
    if (!res.ok || !body || body.success === false) {
      const err = body?.error
      throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? `Request failed (${res.status})`)
    }
    return { data: body.data as T, pagination: body.pagination ?? null, status: res.status }
  }

  return { request }
}
