"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { notifyLater } from "@/lib/email/notify";
import { sendEmail } from "@/lib/email/send";
import { sellerApprovedEmail } from "@/lib/email/templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setSellerVerified(formData: FormData) {
  const admin = await requireAdmin();

  const sellerId = String(formData.get("sellerId") ?? "");
  const verified = formData.get("verified") === "true";
  if (!UUID.test(sellerId)) return;

  // Approve only boutiques whose owner confirmed their email: otherwise orders and
  // payout emails could go to an address the applicant doesn't own.
  if (verified) {
    const [owner] = await db
      .select({ confirmed: users.emailVerified })
      .from(sellerProfiles)
      .innerJoin(users, eq(sellerProfiles.userId, users.id))
      .where(eq(sellerProfiles.id, sellerId));
    if (!owner?.confirmed) return;
  }

  // Only an actual change counts, so a double click can't send two approval emails.
  const changed = await db
    .update(sellerProfiles)
    .set({ isVerified: verified })
    .where(and(eq(sellerProfiles.id, sellerId), eq(sellerProfiles.isVerified, !verified)))
    .returning({ userId: sellerProfiles.userId, shopName: sellerProfiles.shopName });

  if (changed.length === 1) {
    await audit(admin.id, verified ? "approve_boutique" : "revoke_boutique", { type: "seller", id: sellerId }, `${verified ? "Approved" : "Revoked"} ${changed[0].shopName}`);
  }
  if (verified && changed.length === 1) {
    const { userId, shopName } = changed[0];
    notifyLater("seller approved", async () => {
      const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
      if (owner) await sendEmail(sellerApprovedEmail({ to: owner.email, shopName }));
    });
  }

  updateTag(PRODUCTS_TAG); // approving/revoking changes what the storefront shows
  revalidatePath("/admin");
  revalidatePath("/seller/dashboard");
}
