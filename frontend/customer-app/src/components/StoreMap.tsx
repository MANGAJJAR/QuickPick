import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { Store } from '../api/types'

interface Props {
  user: { lat: number; lng: number } | null
  stores: Store[]
  onSelect(storeId: string): void
}

const pin = (color: string, label = '') =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 32],
    html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:grid;place-items:center"><span style="transform:rotate(45deg);color:#fff;font:700 12px sans-serif">${label}</span></div>`,
  })

/** OpenStreetMap view (no API key). Lazy-loaded so Leaflet stays out of the main bundle. */
export default function StoreMap({ user, stores, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const points: L.LatLngExpression[] = []
    for (const s of stores) {
      const ll: L.LatLngExpression = [s.location.lat, s.location.lng]
      points.push(ll)
      const open = s.operating_status === 'OPEN'
      L.marker(ll, { icon: pin(open ? '#1B4332' : '#6f7568', open ? '' : 'x'), title: s.name, alt: s.name })
        .addTo(map)
        .bindTooltip(`${s.name} · ${open ? 'Open' : 'Closed'}`)
        .on('click', () => onSelect(s.id))
    }
    if (user) {
      points.push([user.lat, user.lng])
      L.circleMarker([user.lat, user.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#C85A32', fillOpacity: 1 }).addTo(map).bindTooltip('You')
    }
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 })
    else if (points.length === 1) map.setView(points[0]!, 14)
    else map.setView([20.5937, 78.9629], 4)

    return () => {
      map.remove()
    }
  }, [user, stores, onSelect])

  return <div ref={el} role="application" aria-label="Map of nearby stores" className="h-[380px] w-full overflow-hidden rounded-card border border-line md:h-[460px]" />
}
