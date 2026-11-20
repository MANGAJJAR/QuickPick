import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { makeAuth } from '../test/utils'
import { AuthContext } from './AuthContext'
import { RequireAuth } from './RequireAuth'

function Login() {
  const loc = useLocation()
  return <p>login-page from={(loc.state as { from?: string } | null)?.from}</p>
}

function renderAt(path: string, auth = makeAuth(null)) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/orders" element={<RequireAuth><p>secret-orders</p></RequireAuth>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('redirects signed-out visitors to /login and remembers where they were going', () => {
    renderAt('/orders')
    expect(screen.getByText(/login-page/)).toHaveTextContent('from=/orders')
    expect(screen.queryByText('secret-orders')).not.toBeInTheDocument()
  })

  it('renders the page for signed-in users', () => {
    renderAt('/orders', makeAuth())
    expect(screen.getByText('secret-orders')).toBeInTheDocument()
  })

  it('shows a loading state (not a redirect) while auth initialises', () => {
    renderAt('/orders', { ...makeAuth(null), loading: true })
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })
})
