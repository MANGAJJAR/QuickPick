import { useMutation } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import type { OrderStatus, PickupCredential } from '../api/types'
import { formatClock } from '../lib/format'
import { CheckIcon } from './icons'
import { Button, Card, ErrorState, Skeleton } from './ui'

function useCountdown(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  return expiresAt ? new Date(expiresAt).getTime() - now : 0
}

export function PickupSuccess() {
  return (
    <Card className="p-6 text-center" role="status">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-white anim-pop"><CheckIcon width={32} height={32} /></div>
      <h2 className="mt-4 font-display text-3xl font-semibold text-accent">Pickup complete</h2>
      <p className="mt-1 text-ink-soft">Enjoy your order. Thanks for skipping the delivery fee.</p>
    </Card>
  )
}

/** Pickup credential: QR + OTP while READY_FOR_PICKUP; success after COMPLETED; hidden otherwise. */
export function PickupPanel({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const api = useApi()
  const [credential, setCredential] = useState<PickupCredential | null>(null)
  const requested = useRef(false)
  const fetchCredential = useMutation({
    mutationFn: () => api.getPickupCredential(orderId),
    onSuccess: setCredential,
  })
  const remaining = useCountdown(credential?.expires_at ?? null)
  const expired = !!credential && remaining <= 0

  // The credential endpoint has side effects (it issues a fresh code), so fetch once per READY visit.
  useEffect(() => {
    if (status === 'READY_FOR_PICKUP' && !requested.current) {
      requested.current = true
      fetchCredential.mutate()
    }
    if (status !== 'READY_FOR_PICKUP') {
      requested.current = false
      setCredential(null) // never keep a credential once the order has moved on
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (status === 'COMPLETED') return <PickupSuccess />
  if (status !== 'READY_FOR_PICKUP') return null

  if (fetchCredential.isError && !credential) {
    return <ErrorState error={fetchCredential.error} onRetry={() => fetchCredential.mutate()} title="Couldn’t load your pickup code" />
  }
  if (!credential) {
    return <Card className="space-y-3 p-6" aria-busy="true" aria-label="Loading pickup code"><Skeleton className="mx-auto h-56 w-56" /><Skeleton className="mx-auto h-8 w-40" /></Card>
  }

  return (
    <Card className="overflow-hidden text-center">
      <div className="banner-texture bg-brand-600 px-5 py-4 text-white"><h2 className="font-display text-2xl font-semibold">Show this at the pickup counter</h2></div>
      <div className="p-5">
      {expired ? (
        <div className="mt-4" role="alert">
          <div className="mx-auto grid h-56 w-56 place-items-center rounded-2xl bg-canvas text-ink-faint">Code expired</div>
          <p className="mt-3 text-sm text-ink-soft">For your security, pickup codes expire quickly. Get a new one to continue.</p>
          <Button className="mt-3" loading={fetchCredential.isPending} onClick={() => fetchCredential.mutate()}>Get a new code</Button>
          {fetchCredential.isError && <p className="mt-2 text-sm text-danger-600">{fetchCredential.error.message}</p>}
        </div>
      ) : (
        <>
          <div className="mx-auto mt-2 w-fit rounded-2xl border-2 border-dashed border-wheat-500 bg-white p-4" aria-label="Pickup QR code">
            <QRCodeSVG value={credential.qr_payload} size={224} level="M" role="img" aria-label="QR code for store staff to scan" />
          </div>
          <p className="mt-4 text-sm font-medium text-ink-soft">Or tell the store this code</p>
          <p className="mt-2 inline-block rounded-2xl bg-wheat-100 px-5 py-2 text-4xl font-extrabold tracking-[0.25em] text-accent num" aria-label={`One-time code ${credential.otp.split('').join(' ')}`} data-testid="otp">{credential.otp}</p>
          <p className={`mt-3 text-sm font-semibold num ${remaining < 30_000 ? 'text-warn-600' : 'text-ink-soft'}`} data-testid="countdown" role="timer">
            Expires in {formatClock(remaining)}
          </p>
          <Button variant="ghost" size="sm" className="mt-1" loading={fetchCredential.isPending} onClick={() => fetchCredential.mutate()}>Refresh code</Button>
        </>
      )}
      </div>
    </Card>
  )
}
