import { NextResponse } from "next/server";
import { findProductByCode } from "@/lib/catalog";
import { REF_COOKIE, REF_COOKIE_DAYS } from "@/lib/shop-links";

// Short product link a boutique shares on WhatsApp / Instagram: mivo.lk/p/<code>.
// Opens the product page and remembers (for 7 days) that the buyer came through this
// boutique's link, so the order is recorded as the boutique's own sale and the page
// leads back to the boutique instead of the whole marketplace.
export async function GET(req: Request, ctx: RouteContext<"/p/[code]">) {
  const { code } = await ctx.params;
  const product = await findProductByCode(code.toLowerCase());
  if (!product) return NextResponse.redirect(new URL("/", req.url));

  const res = NextResponse.redirect(new URL(`/product/${product.id}`, req.url));
  res.cookies.set(REF_COOKIE, product.sellerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REF_COOKIE_DAYS * 24 * 60 * 60,
  });
  return res;
}
