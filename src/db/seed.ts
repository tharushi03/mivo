// Run with: npm run db:seed   (safe to run more than once)
import bcrypt from "bcryptjs";
import { db } from "./index";
import { users, sellerProfiles } from "./schema";

const PASSWORD = "password123";

async function upsertUser(name: string, email: string, role: "ADMIN" | "SELLER" | "BUYER", passwordHash: string) {
  const [user] = await db
    .insert(users)
    .values({ name, email, role, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { name, role, passwordHash } })
    .returning();
  return user;
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await upsertUser("MIVO Admin", "admin@mivo.lk", "ADMIN", passwordHash);
  await upsertUser("Test Buyer", "buyer@mivo.lk", "BUYER", passwordHash);
  const seller = await upsertUser("Mivo Test Boutique", "seller@mivo.lk", "SELLER", passwordHash);

  await db
    .insert(sellerProfiles)
    .values({
      userId: seller.id,
      shopName: "Mivo Test Boutique",
      instagramUrl: "https://instagram.com/mivotest",
      isVerified: true,
    })
    .onConflictDoNothing({ target: sellerProfiles.userId });

  // A second boutique that starts unverified, to test admin approval.
  const pendingSeller = await upsertUser("Colombo Batik House", "batik@mivo.lk", "SELLER", passwordHash);
  await db
    .insert(sellerProfiles)
    .values({
      userId: pendingSeller.id,
      shopName: "Colombo Batik House",
      instagramUrl: "https://instagram.com/colombobatikhouse",
      isVerified: false,
    })
    .onConflictDoNothing({ target: sellerProfiles.userId });

  console.log(`Seeded test accounts (password for all: ${PASSWORD}):`);
  console.log("  admin@mivo.lk   (ADMIN)");
  console.log("  seller@mivo.lk  (SELLER)");
  console.log("  batik@mivo.lk   (SELLER, awaiting approval)");
  console.log("  buyer@mivo.lk   (BUYER)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
