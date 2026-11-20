import type { SVGProps } from 'react'

function Icon({ d, size = 20, ...rest }: SVGProps<SVGSVGElement> & { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  )
}
type P = SVGProps<SVGSVGElement> & { size?: number }

export const GridIcon = (p: P) => <Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" {...p} />
export const BoardIcon = (p: P) => <Icon d="M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z" {...p} />
export const ScanIcon = (p: P) => <Icon d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" {...p} />
export const QueueIcon = (p: P) => <Icon d="M4 6h16M4 12h16M4 18h10" {...p} />
export const BoxIcon = (p: P) => <Icon d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" {...p} />
export const ChartIcon = (p: P) => <Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p} />
export const BellIcon = (p: P) => <Icon d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" {...p} />
export const CheckIcon = (p: P) => <Icon d="M5 12.5l4.5 4.5L19 7.5" {...p} />
export const XIcon = (p: P) => <Icon d="M6 6l12 12M18 6L6 18" {...p} />
export const ClockIcon = (p: P) => <Icon d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" {...p} />
export const HandIcon = (p: P) => <Icon d="M7 12V6a1.5 1.5 0 0 1 3 0v5M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2-3a1.5 1.5 0 0 1 2.4-1.8L7 14" {...p} />
export const BagIcon = (p: P) => <Icon d="M6 8h12l1 12H5zM9 8a3 3 0 0 1 6 0" {...p} />
export const BellRingIcon = (p: P) => <Icon d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0M3 6a10 10 0 0 1 3-3M21 6a10 10 0 0 0-3-3" {...p} />
export const InfoIcon = (p: P) => <Icon d="M12 11v5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" {...p} />
export const AlertIcon = (p: P) => <Icon d="M12 9v4M12 17h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z" {...p} />
export const BackspaceIcon = (p: P) => <Icon d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM13 10l4 4M17 10l-4 4" {...p} />
export const ExitIcon = (p: P) => <Icon d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9" {...p} />
