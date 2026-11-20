import { useEffect, useId, useRef, useState } from 'react'

interface Props {
  /** Called for every successful camera read. Debouncing is the caller's job (see lib/scanGate). */
  onScan(text: string): void
}

type CamState = 'starting' | 'running' | 'denied' | 'unavailable'

/** Camera QR scanner (html5-qrcode, loaded lazily). Falls back gracefully when there is no camera. */
export default function QrScanner({ onScan }: Props) {
  const elementId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [state, setState] = useState<CamState>('starting')

  useEffect(() => {
    let stopped = false
    let scanner: { stop(): Promise<void>; clear(): void; isScanning: boolean } | null = null

    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (stopped) return
        scanner = new Html5Qrcode(elementId, { verbose: false }) as unknown as typeof scanner
        await (scanner as unknown as InstanceType<typeof Html5Qrcode>).start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (text) => onScanRef.current(text),
          () => {},
        )
        if (!stopped) setState('running')
      } catch (err) {
        if (stopped) return
        const msg = String(err instanceof Error ? err.message : err).toLowerCase()
        setState(msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed') ? 'denied' : 'unavailable')
      }
    })()

    return () => {
      stopped = true
      const s = scanner
      if (s) void (s.isScanning ? s.stop() : Promise.resolve()).catch(() => {}).finally(() => { try { s.clear() } catch { /* ignore */ } })
    }
  }, [elementId])

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink">
      <div id={elementId} className="min-h-[300px] w-full [&_video]:w-full" aria-label="Camera view for scanning the customer's QR code" />
      {state !== 'running' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-white" role="status">
          {state === 'starting' && <p className="text-lg font-bold">Starting camera…</p>}
          {state === 'denied' && <p className="text-lg font-bold">Camera access is blocked.<br /><span className="text-sm font-medium text-white/80">Allow the camera in the browser, or use the code keypad / a handheld scanner.</span></p>}
          {state === 'unavailable' && <p className="text-lg font-bold">No camera available.<br /><span className="text-sm font-medium text-white/80">Use the code keypad, or a handheld scanner (it types the code into the box below).</span></p>}
        </div>
      )}
    </div>
  )
}
