import type { RiderSupply, Weather } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useSetSignals, useSignals } from '../hooks/queries'
import { Card, Pill, Skeleton } from './ui'

const SUPPLY: { value: RiderSupply; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
  { value: 'VERY_LOW', label: 'Very low' },
]

/**
 * Rider supply and weather. When riders are scarce, delivery ETAs climb and QuickPick automatically raises the
 * pickup discount for customers within walking distance ("Riders are busy. Walk 3 min and save ₹40").
 * Rider supply is SIMULATED here (there is no live rider feed yet): the manager sets it to demo the effect.
 */
export function RiderSupplyCard() {
  const { role } = useAuth()
  const signals = useSignals()
  const set = useSetSignals()
  const isManager = role === 'STORE_MANAGER'
  const s = signals.data

  if (signals.isError) return null // an older backend without signals: nothing to show
  return (
    <Card className="mb-5 p-5" aria-labelledby="riders-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="riders-title" className="text-lg font-extrabold">Rider supply</h2>
          <p className="max-w-xl text-sm text-ink-soft">When riders are scarce, delivery slows down and nearby customers are automatically offered a bigger discount to walk and pick up instead.</p>
        </div>
        {s && <Pill tone={s.surge_active ? 'warn' : 'good'}>{s.surge_active ? 'Riders are busy' : 'Riders are normal'}</Pill>}
      </div>

      {!s ? <Skeleton className="mt-4 h-20 w-full" /> : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="mb-1 text-sm font-bold" id="supply-label">Rider supply</p>
              <div role="radiogroup" aria-labelledby="supply-label" className="flex overflow-hidden rounded-xl border-2 border-line">
                {SUPPLY.map((o) => {
                  const active = s.rider_supply === o.value
                  return (
                    <button
                      key={o.value}
                      role="radio"
                      aria-checked={active}
                      disabled={!isManager || set.isPending}
                      onClick={() => !active && set.mutate({ riderSupply: o.value, weather: s.sources.weather === 'override' ? s.weather : null })}
                      className={`min-h-12 min-w-24 px-4 text-base font-extrabold disabled:cursor-not-allowed ${active ? 'bg-brand-600 text-white' : 'bg-surface text-ink-soft hover:bg-canvas disabled:hover:bg-surface'}`}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="text-sm font-bold">Weather
              <select
                className="mt-1 block min-h-12 rounded-xl border-2 border-line bg-surface px-3 font-bold disabled:opacity-60"
                value={s.sources.weather === 'override' ? s.weather : 'AUTO'}
                disabled={!isManager || set.isPending}
                onChange={(e) => set.mutate({ riderSupply: s.rider_supply, weather: e.target.value === 'AUTO' ? null : (e.target.value as Weather) })}
              >
                <option value="AUTO">Live weather ({s.sources.weather === 'override' ? 'off' : s.weather.toLowerCase()})</option>
                <option value="RAIN">Force rain</option>
                <option value="STORM">Force storm</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-bold">Delivery is taking</p>
              <p className="num text-3xl font-extrabold" data-testid="delivery-eta">{s.delivery_eta_minutes}<span className="ml-1 text-base font-semibold italic text-ink-soft">min</span></p>
            </div>
          </div>
          {s.reasons.length > 0 && <p className="mt-3 text-sm font-semibold text-accent">{s.reasons.join(' · ')}</p>}
          <p className="mt-2 text-xs italic text-ink-faint">Rider supply: {s.sources.rider_supply}. Weather: {s.sources.weather}. Rush hour: {s.sources.rush_hour}.</p>
          {!isManager && <p className="mt-2 text-sm text-ink-soft">Only a store manager can change this.</p>}
          {set.isError && <p role="alert" className="mt-2 text-sm font-bold text-danger-600">{set.error.message}</p>}
        </>
      )}
    </Card>
  )
}
