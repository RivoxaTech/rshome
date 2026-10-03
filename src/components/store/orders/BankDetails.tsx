import { CopyButton } from "@/components/ui/CopyButton";
import type { BankAccount } from "@/features/settings/schemas";

const TERM = "text-muted-foreground tracking-[0.2em] uppercase";
const COPYABLE = "flex flex-wrap items-center gap-x-2 gap-y-1";

/**
 * The shop's bank account(s) with copy buttons on the numbers; shown at checkout, on the order
 * page and, since S14, as the live preview on the panel's bank settings page. `relative` makes
 * this the containing block for the copy buttons' absolutely-positioned `sr-only` labels: without
 * it those boxes anchor to the document root and, inside the panel's fixed-height shell, grow the
 * document past the viewport so the whole page scrolls (the D47 class of bug; found at 375px).
 */
export function BankDetails({ accounts, className = "" }: { accounts: BankAccount[]; className?: string }) {
  return (
    <div className={`relative grid gap-6 ${className}`}>
      {accounts.map((account) => (
        <dl key={`${account.bankName}-${account.accountNumber}`} className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
          <dt className={TERM}>Bank</dt>
          <dd>{account.bankName}</dd>
          <dt className={TERM}>Title</dt>
          <dd>{account.accountTitle}</dd>
          <dt className={`${TERM} self-center`}>Account</dt>
          <dd className={COPYABLE}>
            <span className="tracking-widest break-all">{account.accountNumber}</span>
            <CopyButton value={account.accountNumber} label="Copy account number" />
          </dd>
          {account.iban && (
            <>
              <dt className={`${TERM} self-center`}>IBAN</dt>
              <dd className={COPYABLE}>
                <span className="tracking-widest break-all">{account.iban}</span>
                <CopyButton value={account.iban} label="Copy IBAN" />
              </dd>
            </>
          )}
          {account.note && <dd className="text-muted-foreground col-span-2 leading-relaxed">{account.note}</dd>}
        </dl>
      ))}
    </div>
  );
}
