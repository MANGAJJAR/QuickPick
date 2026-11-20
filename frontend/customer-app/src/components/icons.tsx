import type { SVGProps } from 'react'

function Icon({ d, ...rest }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  )
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 11l9-8 9 8M5 10v10h14V10" {...p} />
export const ReceiptIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" {...p} />
export const BellIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" {...p} />
export const CartIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 4h2l2.4 11h10.2L20 7H6M9 20h.01M17 20h.01" {...p} />
export const PinIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" {...p} />
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" {...p} />
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 12.5l4.5 4.5L19 7.5" {...p} />
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 5v14M5 12h14" {...p} />
export const MinusIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 12h14" {...p} />
export const BackIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M15 5l-7 7 7 7" {...p} />
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6 6l12 12M18 6L6 18" {...p} />
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" {...p} />
export const StoreIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5" {...p} />
export const SunMoonIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" {...p} />
export const BasketIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 10h18l-2 10H5zM8 10l3-6M16 10l-3-6" {...p} />
export const WalkIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 21l2-7-3-2 1-5 4 1 2 3h3M11 14l3 3v4" {...p} />
export const BikeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 17l-2-6h6l2 6M10 11l-1-3H7M15 8h2" {...p} />
