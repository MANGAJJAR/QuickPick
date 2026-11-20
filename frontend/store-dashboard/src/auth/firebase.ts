import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { config } from '../config'

/** Returns a problem description if Firebase env config is incomplete, else null. */
export function firebaseConfigError(): string | null {
  const { apiKey, authDomain, projectId, appId } = config.firebase
  const missing = Object.entries({ VITE_FIREBASE_API_KEY: apiKey, VITE_FIREBASE_AUTH_DOMAIN: authDomain, VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_APP_ID: appId })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  return missing.length ? `Firebase is not configured (missing ${missing.join(', ')}). See the README.` : null
}

let cached: { app: FirebaseApp; auth: Auth } | null = null

export function getFirebaseAuth(): Auth {
  if (cached) return cached.auth
  const app = getApps()[0] ?? initializeApp({
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    appId: config.firebase.appId,
  })
  const auth = getAuth(app)
  if (config.firebase.emulatorUrl) connectAuthEmulator(auth, config.firebase.emulatorUrl, { disableWarnings: true })
  cached = { app, auth }
  return auth
}

/** The shared Firebase app (also used by push messaging). */
export function getFirebaseApp(): FirebaseApp {
  getFirebaseAuth()
  return cached!.app
}
