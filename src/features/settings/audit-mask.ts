import type { BankAccount } from "./schemas";

const MASK = "••••";

/**
 * Keeps only the last four characters of an account number or IBAN, so an `audit_logs` row never
 * carries the full value (S14, ARCHITECTURE.md D56): the audit viewer is readable by a role that
 * must never see the bank details themselves. Four characters or fewer become the mask alone.
 */
export function maskSecret(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return MASK;
  return `${MASK}${trimmed.slice(-4)}`;
}

/** The bank accounts as they may appear in an audit row: numbers and IBANs masked, everything else as is. */
export function maskBankAccountsForAudit(accounts: BankAccount[]): BankAccount[] {
  return accounts.map((account) => ({
    ...account,
    accountNumber: maskSecret(account.accountNumber) ?? "",
    iban: maskSecret(account.iban),
  }));
}
