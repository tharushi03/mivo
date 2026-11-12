"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "@/auth";
import { blockedFor, clientIp, hit, minutesText } from "@/lib/rate-limit";
import { notifyLater } from "@/lib/email/notify";
import { sendConfirmationEmail } from "@/lib/email-verification";

export type RegisterState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
  values?: { name?: string; email?: string };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeCallback(value: FormDataEntryValue | null) {
  const url = typeof value === "string" ? value : "";
  return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

// Creates a BUYER account and signs them in. Sellers are onboarded separately.
export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 255);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 255);
  const password = String(formData.get("password") ?? "");
  const values = { name, email };

  // Limit sign-up attempts per network (stops bots mass-creating accounts or
  // probing which emails are registered).
  const ip = clientIp(await headers());
  const waitMs = blockedFor("register", ip);
  if (waitMs > 0) {
    return { error: `Too many sign-up attempts from your network. Please try again in ${minutesText(waitMs)}.`, values };
  }
  hit("register", ip); // the 10th attempt still goes through; the 11th is blocked

  const fieldErrors: RegisterState["fieldErrors"] = {};
  if (name.length < 2) fieldErrors.name = "Enter your name.";
  if (!EMAIL.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  else if (password.length > 72) fieldErrors.password = "Use 72 characters or fewer.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await db
    .insert(users)
    .values({ name, email, passwordHash, role: "BUYER" })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (created.length === 0) {
    return { fieldErrors: { email: "An account with this email already exists. Try logging in." }, values };
  }

  notifyLater("confirm email", () => sendConfirmationEmail(email));
  try {
    await signIn("credentials", { email, password, redirectTo: safeCallback(formData.get("callbackUrl")) });
    return {};
  } catch (error) {
    if (error instanceof AuthError) return { error: "Account created, but sign-in failed. Please log in.", values };
    throw error; // redirect
  }
}
