/** The QuickPick mark (white Q with a pickup arrow on forest green). The image carries its own background. */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return <img src="/logo.png" alt="" width={64} height={64} className={`${className} shrink-0 rounded-xl`} />
}
