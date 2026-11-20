import { createContext, useContext } from 'react'

export interface AuthUser {
  uid: string
  email: string | null
  name: string | null
}

export interface AuthState {
  user: AuthUser | null
  /** True until the initial auth state is known. */
  loading: boolean
  isMock: boolean
  /** Null when Firebase is configured; otherwise a human-readable setup problem. */
  configError: string | null
  signIn(email: string, password: string): Promise<void>
  signUp(name: string, email: string, password: string): Promise<void>
  signOut(): Promise<void>
  getToken(forceRefresh?: boolean): Promise<string | null>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
