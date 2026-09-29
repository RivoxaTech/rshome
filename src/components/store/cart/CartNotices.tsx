import type { CartNotice } from "@/features/cart/quote";

/** What the server changed about the cart (removed or capped lines, a dropped coupon). */
export function CartNotices({ notices, className = "" }: { notices: CartNotice[]; className?: string }) {
  if (notices.length === 0) return null;
  return (
    <ul role="status" className={`border-champagne bg-champagne/10 grid gap-2 border-l-2 px-4 py-3 text-xs leading-relaxed ${className}`}>
      {notices.map((notice) => (
        <li key={notice.message}>{notice.message}</li>
      ))}
    </ul>
  );
}
