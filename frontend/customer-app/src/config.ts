/** Runtime configuration from Vite env (public web config only, no secrets). */

const env = import.meta.env

export const config = {
  apiBaseUrl: (env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080/api/v1',
  useMocks: env.VITE_USE_MOCKS === 'true',
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: env.VITE_FIREBASE_APP_ID as string | undefined,
    /** Only needed for background push (Firebase Cloud Messaging). */
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    vapidKey: env.VITE_FIREBASE_VAPID_KEY as string | undefined,
    emulatorUrl: (env.VITE_FIREBASE_AUTH_EMULATOR_URL as string | undefined) || undefined,
  },
  /** Order polling interval while an order is open. */
  orderPollMs: 6000,
  /** UI-only thresholds (the server remains the source of truth for stock). */
  lowStockThreshold: 5,
  /** The API exposes no prep time; this is a clearly labelled estimate shown in the UI. */
  estimatedPrepMinutes: '10-15',
} as const
