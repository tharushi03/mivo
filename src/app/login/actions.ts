"use server";

import { headers } from "next/headers";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { clientIp, loginBlockedFor, minutesText } from "@/lib/rate-limit";

export type LoginState = { error?: string };

function safeCallback(value: FormDataEntryValue | null) {
  const url = typeof value === "string" ? value : "";
  // Only allow same-site relative paths (blocks open redirects like "//evil.com").
  return url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
    return {};
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      const email = String(formData.get("email") ?? "").trim().toLowerCase();
      const wait = loginBlockedFor(email, clientIp(await headers()));
      return { error: `Too many failed attempts. For your security, please wait ${minutesText(wait || 15 * 60_000)} and try again.` };
    }
    if (error instanceof CredentialsSignin && error.code === "suspended") {
      return { error: "This account has been suspended. Please contact MIVO support if you think this is a mistake." };
    }
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // Re-throw so Next.js can perform the redirect.
  }
}
