import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { config } from '../config'
import { AuthContext, type AuthState, type AuthUser, type MockRole } from './AuthContext'
import { firebaseConfigError, getFirebaseAuth } from './firebase'

const MOCK_KEY = 'qd-mock-role'
const MOCK_ROLES: Record<MockRole, { role: string; user: AuthUser }> = {
  manager: { role: 'STORE_MANAGER', user: { uid: 'mock-manager', email: 'manager@satellite.quickpick.app', name: 'Meera (Manager)' } },
  staff: { role: 'STORE_STAFF', user: { uid: 'mock-staff', email: 'staff@satellite.quickpick.app', name: 'Sam (Counter staff)' } },
  customer: { role: 'CUSTOMER', user: { uid: 'mock-customer', email: 'customer@example.com', name: 'A Customer' } },
}

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [mock, setMock] = useState<MockRole | null>(() => {
    try {
      const v = sessionStorage.getItem(MOCK_KEY)
      return v === 'manager' || v === 'staff' || v === 'customer' ? v : null
    } catch {
      return null
    }
  })
  const value = useMemo<AuthState>(
    () => ({
      user: mock ? MOCK_ROLES[mock].user : null,
      role: mock ? MOCK_ROLES[mock].role : null,
      loading: false, isMock: true, configError: null,
      async signIn() { /* mock uses mockSignIn */ },
      mockSignIn(role) { sessionStorage.setItem(MOCK_KEY, role); setMock(role) },
      async signOut() { sessionStorage.removeItem(MOCK_KEY); setMock(null) },
      async getToken() { return mock ? 'mock-token' : null },
    }),
    [mock],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const configError = firebaseConfigError()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(!configError)

  useEffect(() => {
    if (configError) return
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      if (!u) {
        setUser(null)
        setRole(null)
        setLoading(false)
        return
      }
      void u.getIdTokenResult().then((res) => {
        setUser({ uid: u.uid, email: u.email, name: u.displayName })
        setRole(typeof res.claims.role === 'string' ? res.claims.role : null)
        setLoading(false)
      }).catch(() => {
        setUser({ uid: u.uid, email: u.email, name: u.displayName })
        setRole(null)
        setLoading(false)
      })
    })
  }, [configError])

  const getToken = useCallback(async (forceRefresh = false) => {
    if (configError) return null
    const current = getFirebaseAuth().currentUser
    return current ? current.getIdToken(forceRefresh) : null
  }, [configError])

  const value = useMemo<AuthState>(
    () => ({
      user, role, loading, isMock: false, configError,
      async signIn(email, password) {
        setLoading(true)
        try {
          await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
        } catch (e) {
          setLoading(false)
          throw e
        }
      },
      async signOut() { if (!configError) await fbSignOut(getFirebaseAuth()) },
      getToken,
    }),
    [user, role, loading, configError, getToken],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return config.useMocks ? <MockAuthProvider>{children}</MockAuthProvider> : <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
}
