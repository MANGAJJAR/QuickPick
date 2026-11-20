import { useState } from 'react'
import { useApi } from '../api/context'
import { enablePush, fcmConfigured, pushPermission, type FcmResult, type PushPermission } from '../push/push'
import { Button, Card } from './ui'

/** Opt-in for counter alerts on the Alerts page. Says plainly what will and will not work. */
export function PushToggle() {
  const api = useApi()
  const [permission, setPermission] = useState<PushPermission>(pushPermission)
  const [fcm, setFcm] = useState<FcmResult | null>(null)
  const [busy, setBusy] = useState(false)

  if (permission === 'unsupported') return null

  async function turnOn() {
    setBusy(true)
    try {
      const r = await enablePush(api)
      setPermission(r.permission)
      setFcm(r.fcm)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-extrabold">Device alerts</p>
        <p className="text-sm text-ink-soft">
          {permission === 'granted'
            ? fcm === 'registered' ? 'On. This device is alerted about new orders and arriving customers even when the dashboard is closed.'
              : fcmConfigured() && !api.isMock ? 'Allowed, but this device could not be registered for background push. Alerts show while the dashboard is open.'
              : 'On while the dashboard is open. Background push needs Firebase Cloud Messaging to be configured.'
            : permission === 'denied'
              ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
              : 'Get alerted about new orders and customers arriving, even from another tab.'}
        </p>
      </div>
      {permission === 'default' && <Button size="sm" loading={busy} onClick={() => void turnOn()}>Turn on</Button>}
      {permission === 'granted' && fcm === null && !api.isMock && fcmConfigured() && <Button size="sm" variant="secondary" loading={busy} onClick={() => void turnOn()}>Register this device</Button>}
    </Card>
  )
}
