import { createContext, useContext } from 'react'

export interface AuthUser {
  uid: string
  email: string | null
  name: string | null
}

export type MockRole = 'manager' | 'staff' | 'customer'

export interface AuthState {
  user: AuthUser | null
  /**
   * The `role` custom claim from the ID token. Used ONLY to decide what UI to show; the backend
   * independently enforces roles and derives the store from the token on every request.
   */
  role: string | null
  /** True until the initial auth state (and claims) are known. */
  loading: boolean
  isMock: boolean
  configError: string | null
  signIn(email: string, password: string): Promise<void>
  /** Mock mode only. */
  mockSignIn?(role: MockRole): void
  signOut(): Promise<void>
  getToken(forceRefresh?: boolean): Promise<string | null>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export const STORE_ROLES = ['STORE_STAFF', 'STORE_MANAGER'] as const

export function isStoreRole(role: string | null): boolean {
  return role !== null && (STORE_ROLES as readonly string[]).includes(role)
}
