import { useMutation, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '../api/context'
import type { Order } from '../api/types'
import { Keypad } from '../components/Keypad'
import { CheckIcon, ExitIcon, XIcon } from '../components/icons'
import { Button, Skeleton, Spinner } from '../components/ui'
import { config } from '../config'
import { keys, useBoard } from '../hooks/queries'
import { formatDuration, formatINR, secondsSince, shortId } from '../lib/format'
import { createScanGate } from '../lib/scanGate'
import { describeVerifyError, type VerifyFailure } from '../lib/verifyErrors'

const QrScanner = lazy(() => import('../components/QrScanner'))

type Result = { kind: 'success'; order: Order } | { kind: 'failure'; failure: VerifyFailure }

/** Full-screen counter mode: camera QR scan or OTP keypad -> big green "Handed over" or a specific red reason. */
export function CounterPage() {
  const api = useApi()
  const qc = useQueryClient()
  const board = useBoard()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('order'))
  const [otp, setOtp] = useState('')
  const [manualQr, setManualQr] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const gate = useRef(createScanGate(config.scanDebounceMs)).current
  useEffect(() => { document.title = 'Pickup counter · QuickPick Store' }, [])

  const ready = useMemo(() => board.data?.READY_FOR_PICKUP ?? [], [board.data])
  // With exactly one order waiting there is nothing to choose, so pre-select it.
  const effectiveSelected = selected ?? (ready.length === 1 ? ready[0]!.id : null)
  const selectedOrder = ready.find((o) => o.id === effectiveSelected) ?? null

  const verify = useMutation({
    mutationFn: (v: { kind: 'qr'; payload: string } | { kind: 'otp'; orderId: string; otp: string }): Promise<Order> =>
      v.kind === 'qr' ? api.verifyQr(v.payload) : api.verifyOtp(v.orderId, v.otp),
    onSuccess: (order) => {
      setResult({ kind: 'success', order })
      setOtp('')
      setManualQr('')
    },
    onError: (err) => setResult({ kind: 'failure', failure: describeVerifyError(err) }),
    onSettled: () => {
      gate.release()
      for (const key of [keys.board, keys.queue, keys.inventory, keys.lowStock, keys.recent, keys.analytics]) void qc.invalidateQueries({ queryKey: key })
    },
  })

  /** Camera / wedge-scanner entry point: debounced so one QR is submitted exactly once. */
  function onScan(payload: string) {
    if (!gate.accept(payload)) return
    verify.mutate({ kind: 'qr', payload: payload.trim() })
  }

  function submitOtp() {
    if (!selectedOrder || otp.length < 4 || verify.isPending) return
    if (!gate.accept(`otp:${selectedOrder.id}:${otp}`)) return
    verify.mutate({ kind: 'otp', orderId: selectedOrder.id, otp })
  }

  function reset() {
    gate.reset()
    verify.reset()
    setResult(null)
  }

  // Auto-return to scanning a few seconds after a successful hand-over.
  useEffect(() => {
    if (result?.kind !== 'success') return
    const t = setTimeout(reset, 12_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  if (result?.kind === 'success') return <SuccessScreen order={result.order} onNext={reset} />
  if (result?.kind === 'failure') return <FailureScreen failure={result.failure} onRetry={reset} />

  return (
    <div className="min-h-dvh bg-canvas p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pickup counter</h1>
          <p className="text-ink-soft">Scan the customer’s QR code, or enter their code.</p>
        </div>
        <Link to="/orders" className="inline-flex min-h-12 items-center gap-2 rounded-lg border-2 border-line bg-surface px-4 font-bold hover:bg-canvas"><ExitIcon /> Exit counter mode</Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-surface p-4" aria-label="Scan QR code">
          <h2 className="mb-3 text-xl font-extrabold">1 · Scan QR code</h2>
          <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
            <QrScanner onScan={onScan} />
          </Suspense>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e: FormEvent) => { e.preventDefault(); onScan(manualQr) }}
          >
            <label className="flex-1 text-sm font-bold">Handheld scanner / pasted QR text
              <input value={manualQr} onChange={(e) => setManualQr(e.target.value)} placeholder="Click here, then scan with a USB scanner" className="mt-1 block min-h-12 w-full rounded-lg border-2 border-line px-3 font-mono text-sm outline-none focus:border-ink" autoComplete="off" />
            </label>
            <Button type="submit" className="self-end" disabled={!manualQr.trim() || verify.isPending}>Verify</Button>
          </form>
        </section>

        <section className="rounded-2xl bg-surface p-4" aria-label="Enter code">
          <h2 className="mb-3 text-xl font-extrabold">2 · Or enter the 6-digit code</h2>
          {ready.length === 0 ? (
            <p className="rounded-lg bg-canvas p-4 text-center font-bold text-ink-soft">No orders are ready for pickup right now.</p>
          ) : (
            <>
              <fieldset className="mb-4">
                <legend className="mb-1 text-sm font-bold">Which order?</legend>
                <div className="flex flex-wrap gap-2">
                  {ready.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={effectiveSelected === o.id}
                      onClick={() => setSelected(o.id)}
                      className={`min-h-14 rounded-xl border-2 px-4 text-left ${effectiveSelected === o.id ? 'border-ink bg-ink text-white' : 'border-line bg-surface'}`}
                    >
                      <span className="block text-lg font-extrabold num">#{shortId(o.id)}</span>
                      <span className="block text-xs opacity-80">{o.items.reduce((n, i) => n + i.quantity, 0)} items · waiting {formatDuration(o.ready_at ? secondsSince(o.ready_at, Date.now()) : null)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <Keypad value={otp} onChange={setOtp} onSubmit={submitOtp} disabled={verify.isPending} />
              <Button size="lg" className="mx-auto mt-4 flex w-full max-w-xs" disabled={!selectedOrder || otp.length < 4 || verify.isPending} loading={verify.isPending} onClick={submitOtp}>
                Verify code
              </Button>
              {!selectedOrder && <p className="mt-2 text-center text-sm font-semibold text-ink-faint">Select the order first.</p>}
            </>
          )}
        </section>
      </div>

      {api.demo && <DemoHelpers onQr={onScan} onPick={(id, code) => { setSelected(id); setOtp(code) }} />}

      {verify.isPending && (
        <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 text-white">
          <div className="flex items-center gap-3 text-2xl font-extrabold"><Spinner /> Verifying…</div>
        </div>
      )}
    </div>
  )
}

function SuccessScreen({ order, onNext }: { order: Order; onNext(): void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-st-ready p-6 text-white" role="status" aria-live="assertive">
      <div className="anim-pop w-full max-w-xl text-center">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-white text-st-ready"><CheckIcon size={64} strokeWidth={3} /></div>
        <h1 className="mt-5 text-6xl font-extrabold tracking-tight">Handed over</h1>
        <p className="mt-2 text-2xl font-bold">Order #{shortId(order.id)}</p>
        <div className="mx-auto mt-6 max-w-md rounded-2xl bg-white/15 p-4 text-left text-lg">
          <ul className="space-y-1">
            {order.items.map((i) => <li key={i.product_id} className="flex gap-3"><b className="w-10 shrink-0 num">{i.quantity}×</b><span>{i.name}</span></li>)}
          </ul>
          <p className="mt-3 flex justify-between border-t border-white/30 pt-3 font-extrabold"><span>Customer paid</span><span className="num">{formatINR(order.total_amount)}</span></p>
        </div>
        <Button size="lg" variant="dark" className="mt-8 min-w-64" onClick={onNext} autoFocus>Next customer</Button>
      </div>
    </div>
  )
}

function FailureScreen({ failure, onRetry }: { failure: VerifyFailure; onRetry(): void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-st-cancelled p-6 text-white" role="alert" aria-live="assertive">
      <div className="anim-pop w-full max-w-xl text-center">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-white text-st-cancelled"><XIcon size={64} strokeWidth={3} /></div>
        <h1 className="mt-5 text-6xl font-extrabold tracking-tight">{failure.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-2xl font-semibold">{failure.detail}</p>
        <p className="mt-2 text-lg font-bold">Do not hand over the order.</p>
        <Button size="lg" variant="dark" className="mt-8 min-w-64" onClick={onRetry} autoFocus>Try again</Button>
      </div>
    </div>
  )
}

/** MOCK MODE ONLY: stand-ins for a customer's phone so every outcome can be demoed. */
function DemoHelpers({ onQr, onPick }: { onQr(payload: string): void; onPick(orderId: string, otp: string): void }) {
  const api = useApi()
  const demo = api.demo
  if (!demo) return null
  const creds = demo.credentials()
  const first = creds[0]
  const used = demo.lastUsedQr()
  const btn = 'min-h-10 rounded-lg border-2 border-dashed border-wheat-500 bg-wheat-50 px-3 text-sm font-bold text-st-placed disabled:opacity-40'
  return (
    <section className="mt-5 rounded-xl border-2 border-dashed border-wheat-500 p-4" aria-label="Mock mode demo helpers">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-st-placed">Mock mode: pretend to be the customer</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={btn} disabled={!first} onClick={() => first && onQr(first.qr_payload)}>Show valid QR</button>
        <button className={btn} disabled={!first} onClick={() => first && onPick(first.order_id, first.otp)}>Fill valid code</button>
        <button className={btn} onClick={() => onQr(demo.expiredQr())}>Show expired QR</button>
        <button className={btn} onClick={() => onQr(demo.wrongStoreQr())}>Show other-store QR</button>
        <button className={btn} disabled={!used} onClick={() => used && onQr(used)}>Re-scan used QR</button>
      </div>
    </section>
  )
}
