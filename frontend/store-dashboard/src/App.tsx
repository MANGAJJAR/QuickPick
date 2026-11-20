import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { StoreGate } from './auth/StoreGate'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { BoardPage } from './pages/BoardPage'
import { CounterPage } from './pages/CounterPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { OverviewPage } from './pages/OverviewPage'
import { QueuePage } from './pages/QueuePage'

// Recharts is heavy; load the analytics page on demand.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))

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
        <EmptyState title="Something broke" body="Reload the page. Orders are safe on the server." action={<button className="min-h-12 rounded-lg bg-ink px-5 font-bold text-white" onClick={() => window.location.reload()}>Reload</button>} />
      </div>
    )
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/counter" element={<StoreGate><CounterPage /></StoreGate>} />
        <Route element={<StoreGate><Layout /></StoreGate>}>
          <Route index element={<OverviewPage />} />
          <Route path="orders" element={<BoardPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="analytics" element={<Suspense fallback={<div role="status" className="p-8 text-ink-soft">Loading analytics…</div>}><AnalyticsPage /></Suspense>} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="*" element={<EmptyState title="Page not found" action={<Link className="inline-flex min-h-12 items-center rounded-lg bg-ink px-5 font-bold text-white" to="/">Go to overview</Link>} />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
