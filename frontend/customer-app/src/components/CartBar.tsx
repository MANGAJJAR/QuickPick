import { useState } from 'react'
import { useCart } from '../cart/CartContext'
import { useCartLines } from '../hooks/useCartLines'
import { usePreview } from '../hooks/queries'
import { formatINR } from '../lib/format'
import { CartSheet } from './CartSheet'

/** Mobile cart bar: black, floats above the tab bar while the cart has items, opens the cart as a bottom sheet. */
export function CartBar() {
  const { cart, count } = useCart()
  const { storeId, lines } = useCartLines()
  const preview = usePreview(count > 0 ? storeId : null, lines)
  const [open, setOpen] = useState(false)
  if (count === 0 && !open) return null
  const total = preview.data?.pricing.total_amount

  return (
    <>
      {count > 0 && (
        <div className="anim-rise fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center justify-between rounded-[20px] bg-bar py-3 pl-5 pr-3 text-white min-[960px]:hidden">
          <div>
            <p className="text-xs italic text-white/70">{count} item{count === 1 ? '' : 's'} from {cart.store?.name}</p>
            <p className="num text-lg font-extrabold">{total ? formatINR(total) : 'View cart'}</p>
          </div>
          <button onClick={() => setOpen(true)} aria-haspopup="dialog" className="h-11 rounded-xl bg-cta-600 px-5 text-base font-bold text-white active:scale-95">View cart →</button>
        </div>
      )}
      {open && <CartSheet onClose={() => setOpen(false)} />}
    </>
  )
}
