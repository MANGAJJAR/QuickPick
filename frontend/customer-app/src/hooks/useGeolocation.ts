import { useCallback, useEffect, useState } from 'react'

export type GeoStatus = 'idle' | 'asking' | 'granted' | 'denied' | 'unavailable'

export interface Coords {
  lat: number
  lng: number
}

/** Browser geolocation with explicit states so the UI can offer a sensible fallback. */
export function useGeolocation() {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const [status, setStatus] = useState<GeoStatus>(supported ? 'asking' : 'unavailable')
  const [coords, setCoords] = useState<Coords | null>(null)

  const request = useCallback(() => {
    if (!supported) return
    setStatus('asking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [supported])

  useEffect(() => {
    request()
  }, [request])

  return { status, coords, request }
}
