"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles, users } from "@/db/schema";
import { signIn } from "@/auth";
import { blockedFor, clientIp, hit, minutesText } from "@/lib/rate-limit";
import { notifyLater } from "@/lib/email/notify";
import { sendConfirmationEmail } from "@/lib/email-verification";
import { sendEmail } from "@/lib/email/send";
import { adminNewSellerEmail, sellerApplicationReceivedEmail } from "@/lib/email/templates";

type Field = "ownerName" | "shopName" | "instagram" | "email" | "password";

export type SellerSignupState = {
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  values?: Partial<Record<Exclude<Field, "password">, string>>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "@colombo.batik", "colombo.batik", "instagram.com/colombo.batik" or the full URL
 * -> "https://www.instagram.com/colombo.batik". Returns null if it isn't an Instagram handle.
 */
function normaliseInstagram(raw: string): string | null {
  let v = raw.trim();
  v = v.replace(/^https?:\/\//i, "").replace(/^(www\.)?instagram\.com\//i, "").replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? `https://www.instagram.com/${v}` : null;
}

/** Creates a SELLER account plus an unverified boutique profile, then signs them in. */
export async function registerSeller(_prev: SellerSignupState, formData: FormData): Promise<SellerSignupState> {
  const text = (k: Field, max: number) => String(formData.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const ownerName = text("ownerName", 255);
  const shopName = text("shopName", 120);
  const instagramRaw = text("instagram", 200);
  const email = text("email", 255).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { ownerName, shopName, instagram: instagramRaw, email };

  // Same per-network sign-up limit as buyer registration.
  const ip = clientIp(await headers());
  const waitMs = blockedFor("register", ip);
  if (waitMs > 0) return { error: `Too many sign-up attempts from your network. Please try again in ${minutesText(waitMs)}.`, values };
  hit("register", ip);

  const instagramUrl = instagramRaw ? normaliseInstagram(instagramRaw) : null;
  const fieldErrors: SellerSignupState["fieldErrors"] = {};
  if (ownerName.length < 2) fieldErrors.ownerName = "Enter your name.";
  if (shopName.length < 2) fieldErrors.shopName = "Enter your boutique's name.";
  if (instagramRaw && !instagramUrl) fieldErrors.instagram = "Enter your Instagram handle, e.g. @yourboutique.";
  if (!EMAIL.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  else if (password.length > 72) fieldErrors.password = "Use 72 characters or fewer.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await db.transaction(async (tx) => {
    // Shop names must be unique (ignoring case) so buyers aren't confused.
    const [clash] = await tx
      .select({ id: sellerProfiles.id })
      .from(sellerProfiles)
      .where(sql`lower(${sellerProfiles.shopName}) = ${shopName.toLowerCase()}`)
      .limit(1);
    if (clash) return { fieldErrors: { shopName: "A boutique with this name is already on MIVO. Try a different name." } };

    const [user] = await tx
      .insert(users)
      .values({ name: ownerName, email, passwordHash, role: "SELLER" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user) return { fieldErrors: { email: "An account with this email already exists. Log in, or use a different email for your boutique." } };

    // New boutiques start unverified: products stay hidden until MIVO approves them.
    await tx.insert(sellerProfiles).values({ userId: user.id, shopName, instagramUrl, isVerified: false });
    return null;
  });
  if (result) return { ...result, values };

  // Confirmation to the seller, heads-up to every admin.
  notifyLater("seller application", async () => {
    const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "ADMIN"));
    await Promise.all([
      sendEmail(sellerApplicationReceivedEmail({ to: email, shopName })),
      sendConfirmationEmail(email),
      ...admins.map((a) => sendEmail(adminNewSellerEmail({ to: a.email, shopName, email, instagramUrl }))),
    ]);
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/seller/dashboard" });
    return {};
  } catch (error) {
    if (error instanceof AuthError) return { error: "Your boutique was created, but sign-in failed. Please log in.", values };
    throw error; // redirect
  }
}
