import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { Button, EmptyState, ButtonLink } from './components/ui'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { OrderPage } from './pages/OrderPage'
import { OrdersPage } from './pages/OrdersPage'
import { StorePage } from './pages/StorePage'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState title="Something broke" body="Reload the page to continue. Your cart is saved." action={<Button onClick={() => window.location.reload()}>Reload</Button>} />
      </div>
    )
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<HomePage />} />
          <Route path="store/:storeId" element={<StorePage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:orderId" element={<OrderPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="*" element={<EmptyState title="Page not found" action={<ButtonLink to="/">Go home</ButtonLink>} />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
