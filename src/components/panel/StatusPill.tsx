/** A coloured dot + label pill, shared by the discounts and coupons lists (same shape as the product/wholesale pills). */
export function StatusPill({ label, colors }: { label: string; colors: { dot: string; bg: string; text: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}
