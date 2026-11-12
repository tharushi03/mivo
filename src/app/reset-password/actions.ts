"use server";

import { redirect } from "next/navigation";
import { resetPassword } from "@/lib/password-reset";

export type ResetState = { error?: string; fieldErrors?: Partial<Record<"password" | "confirm", string>> };

export async function submitNewPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { fieldErrors: { password: "Use at least 8 characters." } };
  if (password.length > 72) return { fieldErrors: { password: "Use 72 characters or fewer." } };
  if (password !== confirm) return { fieldErrors: { confirm: "The passwords don't match." } };

  const error = await resetPassword(token, password);
  if (error) return { error };
  redirect("/login?reset=1");
}
