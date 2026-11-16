import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

export const emailConfigured = () => !!env.smtp.host;

let transport: Transporter | null = null;

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!emailConfigured()) throw new Error("SMTP is not configured.");
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: env.smtp.from, to, subject, text, html });
}
