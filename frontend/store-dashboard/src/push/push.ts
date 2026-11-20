import type { Api } from '../api/api'
import { getFirebaseApp } from '../auth/firebase'
import { config } from '../config'

export type PushPermission = 'unsupported' | 'default' | 'denied' | 'granted'
export type FcmResult = 'registered' | 'not_configured' | 'unsupported' | 'failed'

export function pushPermission(): PushPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as PushPermission
}

/** True when real phone push (Firebase Cloud Messaging) is configured for this build. */
export function fcmConfigured(): boolean {
  return !!(config.firebase.vapidKey && config.firebase.messagingSenderId && config.firebase.apiKey)
}

/** Shows a system notification (used while the tab is in the background). Never throws. */
export function showSystemNotification(title: string, body: string, tag: string): void {
  try {
    if (pushPermission() === 'granted') new Notification(title, { body, tag, icon: '/favicon.svg' })
  } catch { /* some mobile browsers only allow notifications from a service worker */ }
}

/**
 * Turn on counter alerts: ask for notification permission, then (if FCM is configured) register this device so new
 * orders and arriving customers reach it even when the dashboard is closed.
 * NOT VERIFIED against a real Firebase project in this repo.
 */
export async function enablePush(api: Api): Promise<{ permission: PushPermission; fcm: FcmResult }> {
  if (typeof Notification === 'undefined') return { permission: 'unsupported', fcm: 'unsupported' }
  const permission = (await Notification.requestPermission()) as PushPermission
  if (permission !== 'granted') return { permission, fcm: 'failed' }
  if (!fcmConfigured() || api.isMock) return { permission, fcm: 'not_configured' }
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging')
    if (!(await isSupported()) || !('serviceWorker' in navigator)) return { permission, fcm: 'unsupported' }
    const f = config.firebase
    const qs = new URLSearchParams({ apiKey: f.apiKey ?? '', projectId: f.projectId ?? '', messagingSenderId: f.messagingSenderId ?? '', appId: f.appId ?? '' })
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs.toString()}`)
    const token = await getToken(getMessaging(getFirebaseApp()), { vapidKey: f.vapidKey, serviceWorkerRegistration: registration })
    if (!token) return { permission, fcm: 'failed' }
    await api.registerDevice(token)
    return { permission, fcm: 'registered' }
  } catch {
    return { permission, fcm: 'failed' }
  }
}
