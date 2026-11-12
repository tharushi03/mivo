"use server";

import { requireUser } from "@/lib/dal";
import { blockedFor, hit, minutesText } from "@/lib/rate-limit";
import { isEmailConfirmed, sendConfirmationEmail } from "@/lib/email-verification";
import type { ActionResult } from "./admin-orders";

/** "Resend confirmation email" (at most 3 an hour per account). */
export async function resendConfirmation(): Promise<ActionResult> {
  const user = await requireUser();
  if (await isEmailConfirmed(user.id)) return { ok: true };
  const wait = blockedFor("verifyEmail", user.id);
  if (wait > 0) return { error: `Please wait ${minutesText(wait)} before asking again.` };
  hit("verifyEmail", user.id);
  await sendConfirmationEmail(user.email!);
  return { ok: true };
}
