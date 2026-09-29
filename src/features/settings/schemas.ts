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
