import { useState } from 'react'
import { useApi } from '../api/context'
import { enablePush, fcmConfigured, pushPermission, type FcmResult, type PushPermission } from '../push/push'
import { Button, Card } from './ui'

/** Opt-in for phone alerts on the Alerts page. Says plainly what will and will not work. */
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
        <p className="font-extrabold">Phone alerts</p>
        <p className="text-sm text-ink-soft">
          {permission === 'granted'
            ? fcm === 'registered' ? 'On. We’ll alert you even when the app is closed.'
              : fcmConfigured() && !api.isMock ? 'Allowed, but we couldn’t register this device for background push. Alerts will appear while QuickPick is open.'
              : 'On while QuickPick is open. Background push needs Firebase Cloud Messaging to be configured.'
            : permission === 'denied'
              ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
              : 'Get told the moment your order is accepted and ready.'}
        </p>
      </div>
      {permission === 'default' && <Button size="sm" loading={busy} onClick={() => void turnOn()}>Turn on</Button>}
      {permission === 'granted' && fcm === null && !api.isMock && fcmConfigured() && <Button size="sm" variant="secondary" loading={busy} onClick={() => void turnOn()}>Register this device</Button>}
    </Card>
  )
}
