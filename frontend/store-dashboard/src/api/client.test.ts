import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttp } from './client'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const OK = { success: true, data: { hello: 'world' }, error: null }
const UNAUTH = { success: false, data: null, error: { code: 'unauthorized', message: 'Invalid or expired token' } }

function setup(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift() as Response)
  const getToken = vi.fn(async (force?: boolean) => (force ? 'fresh-token' : 'stale-token'))
  const onUnauthorized = vi.fn()
  const http = createHttp({ baseUrl: 'http://api.test/api/v1', getToken, onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch })
  return { http, fetchImpl, getToken, onUnauthorized }
}

describe('api client', () => {
  it('sends the bearer token and unwraps the envelope', async () => {
    const { http, fetchImpl } = setup([json(200, { ...OK, pagination: { limit: 1, next_cursor: null, has_more: false } })])
    const res = await http.request<{ hello: string }>('GET', '/customers/me', { query: { a: 1, b: undefined } })
    expect(res.data).toEqual({ hello: 'world' })
    expect(res.pagination?.has_more).toBe(false)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/customers/me?a=1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer stale-token')
  })

  it('on 401 refreshes the token once and retries transparently', async () => {
    const { http, getToken, onUnauthorized, fetchImpl } = setup([json(401, UNAUTH), json(200, OK)])
    const res = await http.request('GET', '/customers/me')
    expect(res.data).toEqual({ hello: 'world' })
    expect(getToken).toHaveBeenLastCalledWith(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('on a 401 that survives the refresh calls onUnauthorized (-> redirect to login) and throws', async () => {
    const { http, onUnauthorized } = setup([json(401, UNAUTH), json(401, UNAUTH)])
    await expect(http.request('GET', '/customer/orders')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('maps error envelopes to ApiError with the backend code and message', async () => {
    const { http } = setup([json(409, { success: false, data: null, error: { code: 'insufficient_stock', message: 'Insufficient stock for Milk' } })])
    const err = await http.request('POST', '/customer/orders', { body: { x: 1 }, headers: { 'Idempotency-Key': 'k1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock', message: 'Insufficient stock for Milk' })
  })

  it('reports network failures as ApiError status 0', async () => {
    const http = createHttp({ baseUrl: 'http://api.test', getToken: async () => null, onUnauthorized: vi.fn(), fetchImpl: (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch })
    const err = (await http.request('GET', '/x').catch((e: unknown) => e)) as ApiError
    expect(err.isNetwork).toBe(true)
  })
})
