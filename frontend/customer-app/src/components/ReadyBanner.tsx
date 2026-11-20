import { ESTIMATED_MAX_MINUTES, useReadyBy } from '../lib/eta'

/** Minutes ring. The arc draws once on load (600ms); everything else on the page moves only when the user does something. */
function Ring({ minutes }: { minutes: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center min-[960px]:h-[92px] min-[960px]:w-[92px]" role="img" aria-label={`About ${minutes} minutes`}>
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} className="ring-draw" style={{ ['--ring-length' as string]: c }} />
      </svg>
      <span className="num text-[26px] font-extrabold leading-none text-white min-[960px]:text-3xl">{minutes}<span className="ml-0.5 text-xs font-semibold italic text-white/80">min</span></span>
    </div>
  )
}

/** The honest time promise: a clock time, the minutes, and what it depends on. The one saturated surface on the home screen. */
export function ReadyBanner({ name }: { name?: string }) {
  const by = useReadyBy()
  return (
    <section aria-label="Pickup time" className="flex items-center justify-between gap-4 rounded-[var(--radius-banner)] bg-brand-600 p-5 text-white min-[960px]:p-7">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">Order now, pick up by</p>
        <p className="num mt-1 text-[44px] font-extrabold leading-none tracking-[-0.03em] min-[960px]:text-[56px]">{by}</p>
        <p className="mt-2 text-sm text-white/80">{name ? `${name}, skip` : 'Skip'} the rider. Estimated {ESTIMATED_MAX_MINUTES - 5}-{ESTIMATED_MAX_MINUTES} min once the store accepts. Your discount shows at checkout.</p>
      </div>
      <Ring minutes={ESTIMATED_MAX_MINUTES} />
    </section>
  )
}
