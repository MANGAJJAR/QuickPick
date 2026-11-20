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
    emulatorUrl: (env.VITE_FIREBASE_AUTH_EMULATOR_URL as string | undefined) || undefined,
  },
  /** Live board / queue polling interval. */
  boardPollMs: 5000,
  /** Scanner: ignore an identical payload re-read within this window. */
  scanDebounceMs: 4000,
  /** Order statuses the board shows, left to right. */
  boardStatuses: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] as const,
} as const
