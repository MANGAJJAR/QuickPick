/**
 * Debounce for camera scans. A camera reads the same QR dozens of times per second; this gate
 * lets one payload through, then ignores the same payload for `windowMs` and ignores everything
 * while a verification is in flight, so one QR can never submit twice.
 */
export interface ScanGate {
  /** True if this scan should be processed now. Marks the payload as seen. */
  accept(payload: string, nowMs?: number): boolean
  /** Call when verification finished (success or failure) so a *different* code can be scanned. */
  release(): void
  /** Forget everything (e.g. when starting the next customer). */
  reset(): void
}

export function createScanGate(windowMs: number): ScanGate {
  let lastPayload: string | null = null
  let lastAt = 0
  let busy = false
  return {
    accept(payload, nowMs = Date.now()) {
      const p = payload.trim()
      if (!p || busy) return false
      if (p === lastPayload && nowMs - lastAt < windowMs) return false
      lastPayload = p
      lastAt = nowMs
      busy = true
      return true
    },
    release() {
      busy = false
    },
    reset() {
      lastPayload = null
      lastAt = 0
      busy = false
    },
  }
}
