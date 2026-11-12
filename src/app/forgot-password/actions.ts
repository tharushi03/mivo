"use server";

import { headers } from "next/headers";
import { blockedFor, clientIp, hit, minutesText } from "@/lib/rate-limit";
import { sendResetLink } from "@/lib/password-reset";
import { notifyLater } from "@/lib/email/notify";

export type ForgotState = { sent?: boolean; error?: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Always answers "if an account exists, we've sent a link", and does the lookup
 * after the response, so neither the message nor the timing reveals who has an account.
 */
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 255);
  if (!EMAIL.test(email)) return { error: "Enter the email address you signed up with.", email };

  const ip = clientIp(await headers());
  const wait = blockedFor("resetIp", ip);
  if (wait > 0) return { error: `Too many requests from your network. Please try again in ${minutesText(wait)}.`, email };
  hit("resetIp", ip);

  // Per-email cap stops someone flooding a victim's inbox; silently, so it reveals nothing.
  if (blockedFor("resetEmail", email) === 0) {
    hit("resetEmail", email);
    notifyLater("password reset", () => sendResetLink(email));
  }
  return { sent: true, email };
}
