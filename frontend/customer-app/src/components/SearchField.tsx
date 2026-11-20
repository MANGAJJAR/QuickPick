import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchIcon } from './icons'

const HINTS = ['Search milk, bread, eggs', 'Search paneer, atta, tea', 'Search a store, like Satellite', 'Search chips, juice, ice cream']

/** The search text lives in the URL (?q=) so the top bar and the page body share it and results can be linked. */
export function useSearchQuery(): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const set = (next: string) => {
    const copy = new URLSearchParams(params)
    if (next) copy.set('q', next)
    else copy.delete('q')
    setParams(copy, { replace: true })
  }
  return [q, set]
}

/** 56px field with a rotating italic hint. The hint stops rotating for people who ask for reduced motion. */
export function SearchField({ label, className = '' }: { label: string; className?: string }) {
  const [q, setQ] = useSearchQuery()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((n) => (n + 1) % HINTS.length), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" width={20} height={20} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={HINTS[i]}
        className="h-14 w-full rounded-[var(--radius-search)] border border-line bg-surface pl-12 pr-4 text-base outline-none transition-colors placeholder:italic placeholder:text-ink-faint focus:border-brand-500"
      />
    </label>
  )
}
