import nodemailer from "nodemailer";
import { env } from "@/server/env";

export type MailMessage = { to: string; subject: string; html: string; text: string };

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * Real SMTP when configured; otherwise a `jsonTransport` that builds the message without sending
 * it, so development without SMTP just logs the rendered email (CLAUDE.md §2: server infra, no
 * feature knowledge).
 */
function getTransporter(): ReturnType<typeof nodemailer.createTransport> {
  if (transporter) return transporter;
  transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

/** Sends one email, or logs it when there's no SMTP configured. Throws on a real send failure. */
export async function sendMail(message: MailMessage): Promise<void> {
  const from = env.MAIL_FROM ?? "no-reply@localhost";
  const info = await getTransporter().sendMail({ from, ...message });
  if (!env.SMTP_HOST) {
    console.log(`[dev mail] to=${message.to} subject=${message.subject}\n${info.message}`);
  }
}
