// Sends one email. Never throws: a broken mail server must never break checkout.
//
// Configure with env vars (.env.local locally, Dokploy in production):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
//   e.g. Gmail:  smtp.gmail.com, 465, you@gmail.com, <16-char App Password>
//        Resend: smtp.resend.com, 465, resend, <API key>
// Without SMTP_HOST, emails are written to ./.outbox/*.html instead (local development only;
// in production a missing SMTP_HOST stops the server at startup, see src/lib/env-check.ts).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export type Email = { to: string; subject: string; html: string; text: string };

let transporter: Transporter | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS from the start; 587 = STARTTLS (required below)
      requireTLS: port !== 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // Our emails only contain text we build; never let a message read files or URLs.
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

const OUTBOX = path.join(process.cwd(), /*turbopackIgnore: true*/ ".outbox");

export async function sendEmail(email: Email): Promise<boolean> {
  // Header values must be single-line (no header injection via product titles etc.).
  const subject = email.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  const to = email.to.trim();
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(to)) {
    console.warn(`[email] skipped, invalid address: ${JSON.stringify(to)}`);
    return false;
  }

  const t = getTransporter();
  if (!t && process.env.NODE_ENV === "production") {
    // Never pretend to send in production (the startup check should already have stopped us).
    console.error(`[email] SMTP_HOST is not set. NOT sent: "${subject}" to ${to}`);
    return false;
  }
  try {
    if (!t) {
      await mkdir(OUTBOX, { recursive: true });
      const file = path.join(OUTBOX, `${Date.now()}-${to.replace(/[^a-z0-9]+/gi, "_")}.html`);
      const header = `<!-- To: ${to} | Subject: ${subject.replace(/--/g, "- -")} -->\n`;
      await writeFile(file, header + email.html, "utf8");
      console.log(`[email] SMTP not configured. Saved "${subject}" for ${to} to ${file}`);
      return true;
    }
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? "MIVO <no-reply@mivo.lk>",
      to,
      subject,
      html: email.html,
      text: email.text,
    });
    return true;
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}`, err);
    return false;
  }
}
