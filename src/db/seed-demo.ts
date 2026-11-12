// Demo catalogue for local testing. Run with: npm run db:seed:demo
// (run `npm run db:seed` first). Generates simple placeholder images, so
// replace these with real photos through the seller dashboard.
import { deflateSync } from "node:zlib";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { productVariants, products, sellerProfiles, users } from "./schema";
import { saveImage } from "../lib/storage";

// --- Tiny PNG encoder: vertical gradient between two colours (600x800) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function gradientPng(top: [number, number, number], bottom: [number, number, number], w = 600, h = 800) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const px = top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) raw.set(px, row + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type Demo = {
  title: string;
  description: string;
  price: string;
  category: string;
  /** Stock per size, in display order. */
  stock: Record<string, number>;
  colors: [[number, number, number], [number, number, number]];
  isActive?: boolean;
};

const BOUTIQUE: Demo[] = [
  { title: "Linen Wrap Dress", description: "Breathable pure linen with a tie waist.\nTrue to size. Hand wash cold.", price: "6450", category: "Dresses", stock: { S: 3, M: 3, L: 2 }, colors: [[232, 213, 196], [200, 121, 89]] },
  { title: "Cotton Puff-Sleeve Top", description: "Soft cotton poplin with gathered sleeves.", price: "3200", category: "Tops", stock: { XS: 2, S: 3, M: 3, L: 2, XL: 2 }, colors: [[250, 247, 242], [233, 225, 216]] },
  { title: "Wide-Leg Trousers", description: "High-rise, relaxed fit with side pockets.", price: "4800", category: "Bottoms", stock: { S: 1, M: 0, L: 2, XL: 0 }, colors: [[119, 113, 107], [23, 23, 23]] },
  { title: "Handloom Saree", description: "Handwoven handloom cotton. Blouse piece included.", price: "12900", category: "Sarees", stock: { "FREE SIZE": 2 }, colors: [[102, 124, 104], [52, 72, 56]] },
  { title: "Archived Blazer", description: "Hidden product — should never appear on the storefront.", price: "9900", category: "Other", stock: { M: 1 }, colors: [[60, 60, 60], [20, 20, 20]], isActive: false },
];

const PENDING_SHOP: Demo[] = [
  { title: "Batik Kaftan", description: "Hand-dyed batik kaftan. Visible only once the shop is approved.", price: "5600", category: "Batik", stock: { "FREE SIZE": 5 }, colors: [[66, 92, 140], [201, 76, 76]] },
];

async function sellerIdFor(email: string) {
  const [row] = await db
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .innerJoin(users, eq(sellerProfiles.userId, users.id))
    .where(eq(users.email, email));
  if (!row) throw new Error(`No seller profile for ${email}. Run "npm run db:seed" first.`);
  return row.id;
}

async function insertAll(sellerId: string, list: Demo[]) {
  const existing = await db
    .select({ title: products.title })
    .from(products)
    .where(and(eq(products.sellerId, sellerId), inArray(products.title, list.map((d) => d.title))));
  const have = new Set(existing.map((e) => e.title));

  for (const d of list) {
    if (have.has(d.title)) continue; // idempotent
    const imageUrl = await saveImage(gradientPng(...d.colors), "png");
    const [product] = await db
      .insert(products)
      .values({
        sellerId,
        title: d.title,
        description: d.description,
        price: d.price,
        category: d.category,
        imageUrl,
        isActive: d.isActive ?? true,
      })
      .returning({ id: products.id });
    await db
      .insert(productVariants)
      .values(Object.entries(d.stock).map(([size, stock], position) => ({ productId: product.id, size, stock, position })));
    console.log(`  + ${d.title}`);
  }
}

async function main() {
  await insertAll(await sellerIdFor("seller@mivo.lk"), BOUTIQUE);
  await insertAll(await sellerIdFor("batik@mivo.lk"), PENDING_SHOP);
  console.log("Demo products ready.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
