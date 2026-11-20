import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { config } from '../config'
import { AuthContext, type AuthState, type AuthUser } from './AuthContext'
import { firebaseConfigError, getFirebaseAuth } from './firebase'

const MOCK_KEY = 'qp-mock-user'
const MOCK_USER: AuthUser = { uid: 'mock-user', email: 'demo@quickpick.app', name: 'Demo Customer' }

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      return sessionStorage.getItem(MOCK_KEY) ? MOCK_USER : null
    } catch {
      return null
    }
  })
  const value = useMemo<AuthState>(
    () => ({
      user, loading: false, isMock: true, configError: null,
      async signIn() { sessionStorage.setItem(MOCK_KEY, '1'); setUser(MOCK_USER) },
      async signUp() { sessionStorage.setItem(MOCK_KEY, '1'); setUser(MOCK_USER) },
      async signOut() { sessionStorage.removeItem(MOCK_KEY); setUser(null) },
      async getToken() { return user ? 'mock-token' : null },
    }),
    [user],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const configError = firebaseConfigError()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(!configError)

  useEffect(() => {
    if (configError) return
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u ? { uid: u.uid, email: u.email, name: u.displayName } : null)
      setLoading(false)
    })
  }, [configError])

  const getToken = useCallback(async (forceRefresh = false) => {
    if (configError) return null
    const current = getFirebaseAuth().currentUser
    return current ? current.getIdToken(forceRefresh) : null
  }, [configError])

  const value = useMemo<AuthState>(
    () => ({
      user, loading, isMock: false, configError,
      async signIn(email, password) { await signInWithEmailAndPassword(getFirebaseAuth(), email, password) },
      async signUp(name, email, password) {
        const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
        if (name) await updateProfile(cred.user, { displayName: name })
        await cred.user.getIdToken(true) // make sure the first API call carries the display name
      },
      async signOut() { if (!configError) await fbSignOut(getFirebaseAuth()) },
      getToken,
    }),
    [user, loading, configError, getToken],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return config.useMocks ? <MockAuthProvider>{children}</MockAuthProvider> : <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
}
