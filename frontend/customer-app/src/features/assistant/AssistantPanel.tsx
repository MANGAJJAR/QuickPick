import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { assistantAdapter, type AssistantReply } from '../../api/ai'
import { useCart } from '../../cart/CartContext'
import { CloseIcon } from '../../components/icons'
import { Badge, Button, ErrorState } from '../../components/ui'
import { config } from '../../config'
import { useAllStores, useProducts } from '../../hooks/queries'
import { ProductArt } from '../../components/ProductArt'
import { formatINR, stockState } from '../../lib/format'

interface Message {
  from: 'user' | 'bot'
  text: string
  reply?: AssistantReply
}

const EXAMPLE = '2 milk, bread, pickup in 10 min'
const EXAMPLE_TYPO = 'Spelling mistakes are fine: “2 mlk, brwn bred, paner”'

/** Chat UI. The responder is `assistantAdapter` (currently a labelled MOCK, not Gemini). */
export default function AssistantPanel({ onClose }: { onClose(): void }) {
  const cart = useCart()
  const stores = useAllStores(true)
  const [storeId, setStoreId] = useState<string>(cart.cart.store?.id ?? '')
  const products = useProducts(storeId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { from: 'bot', text: `Tell me what you need, like "${EXAMPLE}". ${EXAMPLE_TYPO}. You can also type a category, like "snacks".` },
  ])
  const endRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!storeId && stores.data?.items[0]) setStoreId(stores.data.items[0].id)
  }, [stores.data, storeId])
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages])

  const catalogue = useMemo(() => products.data?.pages.flatMap((p) => p.items) ?? [], [products.data])
  const store = stores.data?.items.find((s) => s.id === storeId)
  const needsNewCart = !!cart.cart.store && cart.cart.store.id !== storeId && cart.count > 0

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { from: 'user', text }])
    setBusy(true)
    try {
      const reply = await assistantAdapter.reply(text, catalogue)
      setMessages((m) => [...m, { from: 'bot', text: reply.text, reply }])
    } catch {
      setMessages((m) => [...m, { from: 'bot', text: 'Sorry, I could not process that. Please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  function addAll(reply: AssistantReply) {
    if (!store) return
    cart.addMany(
      { id: store.id, name: store.name },
      reply.suggestions.map((s) => ({
        item: { productId: s.product.product.id, name: s.product.product.name, unit: s.product.product.unit, unitPrice: s.product.product.price, maxQty: stockState(s.product.pickable_quantity, config.lowStockThreshold).max },
        quantity: s.quantity,
      })),
      needsNewCart,
    )
    setMessages((m) => [...m, { from: 'bot', text: 'Added to your cart.' }])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Shopping assistant" onClick={(e) => e.stopPropagation()} className="anim-pop flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface sm:h-[640px] sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-lg font-bold">Shopping assistant</h2>
            <Badge tone="warn">{assistantAdapter.label}</Badge>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close assistant" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-canvas"><CloseIcon /></button>
        </header>

        <div className="border-b border-line bg-canvas px-4 py-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-semibold">Store</span>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="min-h-10 flex-1 rounded-lg border border-line bg-surface px-2">
              {stores.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {stores.isError && <ErrorState error={stores.error} onRetry={() => void stores.refetch()} />}
          {messages.map((m, i) => (
            <div key={i} className={m.from === 'user' ? 'text-right' : ''}>
              <p className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.from === 'user' ? 'bg-brand-600 text-white' : 'bg-canvas'}`}>{m.text}</p>
              {m.reply && m.reply.suggestions.length > 0 && (
                <div className="mt-2 rounded-xl border border-line p-3 text-left text-sm">
                  <ul className="space-y-2">
                    {m.reply.suggestions.map((s) => {
                      const p = s.product.product
                      const stock = stockState(s.product.pickable_quantity, config.lowStockThreshold)
                      return (
                        <li key={p.id} className="flex items-center gap-3">
                          <ProductArt id={p.id} name={p.name} category={p.category} className="h-11 w-11 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{s.quantity} × {p.name}</span>
                            <span className="block text-xs text-ink-faint">{p.unit} · {stock.label}{s.matchedFrom ? ` · for “${s.matchedFrom}”` : ''}</span>
                          </span>
                          <span className="num font-bold">{formatINR(p.price)}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {m.reply.unmatched.length > 0 && <p className="mt-2 text-xs text-warn-600">Couldn’t find: {m.reply.unmatched.join(', ')}</p>}
                  {m.reply.pickupInMinutes !== null && <p className="mt-2 text-xs text-ink-faint">You asked for pickup in {m.reply.pickupInMinutes} min. Pickup slots aren’t bookable yet, so the store will prepare it as soon as possible.</p>}
                  {needsNewCart && <p className="mt-2 text-xs text-warn-600">This will replace your current cart from another store.</p>}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => addAll(m.reply!)}>{needsNewCart ? 'Start new cart and add' : 'Add to cart'}</Button>
                    <Link to="/cart" onClick={onClose}><Button size="sm" variant="secondary">View cart</Button></Link>
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-ink-faint">Thinking…</p>}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <label className="flex-1"><span className="sr-only">Message</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={EXAMPLE} className="min-h-12 w-full rounded-xl border border-line px-4 text-base outline-none focus:border-brand-500" />
          </label>
          <Button type="submit" disabled={!input.trim() || busy || !storeId || products.isPending}>Send</Button>
        </form>
      </section>
    </div>
  )
}
