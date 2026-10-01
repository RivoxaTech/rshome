import { z } from "zod";

// Shapes for the `settings` table's JSON-in-TEXT values (DATABASE.md DB2: no JSON columns).

export const contactSchema = z.object({
  phone: z.string().min(1),
  whatsapp: z.string().min(1),
  address: z.string().min(1),
});
export type Contact = z.infer<typeof contactSchema>;

export const socialLinksSchema = z.object({
  facebook: z.string().min(1),
  instagram: z.string().min(1),
  instagramHandle: z.string().min(1),
});
export type SocialLinks = z.infer<typeof socialLinksSchema>;

/** Shown to bank-transfer customers on the order page. `iban` matters for international payers. */
export const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountTitle: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().min(1).nullable().default(null),
  note: z.string().min(1).nullable().default(null),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const bankAccountsSchema = z.array(bankAccountSchema).min(1);

/**
 * Owner alert recipients (S21 Phase 2): `notify_owner_order_emails` (off by default — push is the
 * primary alert) and `notify_owner_wholesale_emails` (on by default, S17). Edited in the database
 * until S14's settings editor.
 */
export const notifyRecipientsSchema = z.array(z.email()).default([]);
export type NotifyRecipients = z.infer<typeof notifyRecipientsSchema>;
