/** A loading placeholder bar. Respects `prefers-reduced-motion` (no pulse animation). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted motion-reduce:animate-none animate-pulse rounded-md ${className}`} />;
}
