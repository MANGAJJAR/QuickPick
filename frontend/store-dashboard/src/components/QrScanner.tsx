import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface Props {
  /** Called for every successful camera read. Debouncing is the caller's job (see lib/scanGate). */
  onScan(text: string): void
}

type CamState = 'starting' | 'running' | 'denied' | 'unavailable'
type Camera = { id: string; label: string }

interface ScannerLike {
  start(camera: string | MediaTrackConstraints, config: unknown, ok: (t: string) => void, err: () => void): Promise<unknown>
  stop(): Promise<void>
  clear(): void
  isScanning: boolean
  scanFile(file: File, showImage?: boolean): Promise<string>
}

/** Scan area: 70% of the shorter video edge, so it fits any camera and screen size. */
const qrbox = (w: number, h: number) => {
  const side = Math.floor(Math.min(w, h) * 0.7)
  return { width: side, height: side }
}

/**
 * Camera QR scanner (html5-qrcode, loaded lazily).
 * - Prefers the rear camera, falls back to any camera (laptops have only a front one).
 * - Never mirrors the preview by default; "Flip view" is there for front cameras that feel backwards.
 * - Camera picker + "Scan a photo" when live scanning is not possible.
 */
export default function QrScanner({ onScan }: Props) {
  const elementId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan })
  const scannerRef = useRef<ScannerLike | null>(null)
  const [state, setState] = useState<CamState>('starting')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [cameraId, setCameraId] = useState<string | null>(null) // null = automatic
  const [flipped, setFlipped] = useState(false)
  const [photoMsg, setPhotoMsg] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    let scanner: ScannerLike | null = null

    void (async () => {
      setState('starting')
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (stopped) return
        scanner = new Html5Qrcode(elementId, { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] }) as unknown as ScannerLike
        scannerRef.current = scanner
        const config = { fps: 12, qrbox, aspectRatio: 1.3333 }
        const ok = (text: string) => onScanRef.current(text)
        const noop = () => {}
        const attempts: Array<string | MediaTrackConstraints> = cameraId
          ? [cameraId]
          : [{ facingMode: 'environment' }, { facingMode: 'user' }]
        let started = false
        let lastErr: unknown
        for (const a of attempts) {
          try { await scanner.start(a, config, ok, noop); started = true; break } catch (e) { lastErr = e }
        }
        if (!started) {
          // Last resort: first enumerated camera (some browsers reject facingMode outright).
          const list = await Html5Qrcode.getCameras().catch(() => [])
          if (list[0]) { await scanner.start(list[0].id, config, ok, noop); started = true }
          else throw lastErr
        }
        if (stopped) return
        setState('running')
        // Labels are only available after permission has been granted.
        const list = await Html5Qrcode.getCameras().catch(() => [])
        if (!stopped) setCameras(list.map((c) => ({ id: c.id, label: c.label || 'Camera' })))
      } catch (err) {
        if (stopped) return
        const msg = String(err instanceof Error ? err.message : err).toLowerCase()
        setState(msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed') ? 'denied' : 'unavailable')
      }
    })()

    return () => {
      stopped = true
      const s = scanner
      scannerRef.current = null
      if (s) void (s.isScanning ? s.stop() : Promise.resolve()).catch(() => {}).finally(() => { try { s.clear() } catch { /* ignore */ } })
    }
  }, [elementId, cameraId])

  const scanPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return
    setPhotoMsg('Reading photo…')
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      // A separate, detached instance: the live one may not be running.
      const host = document.createElement('div')
      host.style.display = 'none'
      host.id = `qr-photo-${Date.now()}`
      document.body.appendChild(host)
      const reader = new Html5Qrcode(host.id, { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] }) as unknown as ScannerLike
      try {
        const text = await reader.scanFile(file, false)
        setPhotoMsg(null)
        onScanRef.current(text)
      } finally {
        reader.clear()
        host.remove()
      }
    } catch {
      setPhotoMsg('No QR code found in that photo. Try again closer and in better light.')
    }
  }, [])

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-ink">
        {/* Explicit scaleX(1): the preview is shown exactly as the camera sees it (not mirrored). */}
        <div
          id={elementId}
          className={`min-h-[300px] w-full [&_video]:w-full [&_video]:object-cover ${flipped ? '[&_video]:[transform:scaleX(-1)]' : '[&_video]:[transform:scaleX(1)]'}`}
          aria-label="Camera view for scanning the customer's QR code"
        />
        {state !== 'running' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white" role="status">
            {state === 'starting' && <p className="text-lg font-bold">Starting camera…</p>}
            {state === 'denied' && <p className="text-lg font-bold">Camera access is blocked.<br /><span className="text-sm font-medium text-white/80">Allow the camera in the browser, or use the code keypad, a handheld scanner, or scan a photo.</span></p>}
            {state === 'unavailable' && <p className="text-lg font-bold">No camera available.<br /><span className="text-sm font-medium text-white/80">Use the code keypad, a handheld scanner (it types the code into the box), or scan a photo.</span></p>}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {cameras.length > 1 && (
          <label className="flex items-center gap-2 font-bold">
            <span className="sr-only">Camera</span>
            <select
              value={cameraId ?? ''}
              onChange={(e) => setCameraId(e.target.value || null)}
              className="min-h-10 rounded-xl border-2 border-line bg-surface px-3 font-bold"
              aria-label="Choose camera"
            >
              <option value="">Auto camera</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} className="min-h-10 rounded-xl border-2 border-line bg-surface px-3 font-bold hover:bg-canvas">
          Flip view
        </button>
        <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border-2 border-line bg-surface px-3 font-bold hover:bg-canvas">
          Scan a photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void scanPhoto(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {photoMsg && <p role="status" className="mt-2 text-sm font-semibold text-warn-600">{photoMsg}</p>}
    </div>
  )
}
