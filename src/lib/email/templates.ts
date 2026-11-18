// Email templates. Email clients ignore <style> blocks and CSS files, so everything
// is inline styles and tables. All user-provided text goes through esc().
import type { Email } from "./send";

const C = { ink: "#171717", accent: "#C87959", cream: "#FAF7F2", muted: "#E9E1D8", grey: "#77716B" };

export function esc(s: string | number | null | undefined) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const lkr = (v: number | string) =>
  "LKR " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Absolute link for emails. Set APP_URL in production, e.g. https://mivo.lk */
export function appUrl(pathname: string) {
  // Production refuses to start without APP_URL (src/lib/env-check.ts), so localhost is dev-only.
  const base = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return base + pathname;
}

type Item = { title: string; size: string; quantity: number };

/**
 * Every buyer email: where the order opens (a guest's secret /track link, or the
 * account's /order page) and the boutique brand for orders from its own link.
 */
type BuyerLink = { orderPath?: string; brand?: string | null };

const NL = "\n";
const itemLines = (items: Item[]) => items.map((i) => `- ${i.title}, size ${i.size} x ${i.quantity}`).join(NL);

/** Wraps content in the MIVO email shell. `bodyHtml` must already be escaped. */
function layout(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  /** Boutique name shown instead of MIVO (orders from the boutique's own link). */
  brand?: string | null;
}) {
  const brand = opts.brand
    ? `<span style="font-size:20px;font-weight:700">${esc(opts.brand)}</span><br><span style="font-size:11px;color:${C.grey};letter-spacing:1px">POWERED BY MIVO</span>`
    : `<span style="font-size:22px;font-weight:700;letter-spacing:5px">MIVO</span>`;
  const footer = opts.brand
    ? `${esc(opts.brand)} · Secure checkout and delivery by MIVO<br>This is an automatic message about your order.`
    : `MIVO · Curated clothing from Sri Lankan boutiques<br>This is an automatic message about your MIVO order.`;
  const button = opts.cta
    ? `<p style="margin:28px 0 8px"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;background:${C.cream};font-family:Helvetica,Arial,sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.muted};border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:3px solid ${C.accent}">${brand}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${esc(opts.heading)}</h1>
${opts.bodyHtml}
${button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${C.muted};font-size:12px;color:${C.grey}">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function itemTable(items: Item[]) {
  const cell = `padding:10px 0;border-bottom:1px solid ${C.muted}`;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="${cell}"><strong>${esc(i.title)}</strong></td>` +
        `<td style="${cell};color:${C.grey};white-space:nowrap">Size ${esc(i.size)}</td>` +
        `<td style="${cell};text-align:right;white-space:nowrap">&times; ${esc(i.quantity)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px">${rows}</table>`;
}

const box = (html: string) =>
  `<div style="background:${C.cream};border-radius:8px;padding:14px 16px;margin:12px 0;font-size:14px">${html}</div>`;

// ---------------------------------------------------------------- Trigger 1: seller, new order to pack

export function sellerNewOrderEmail(d: {
  to: string;
  shopName: string;
  orderRef: string;
  items: Item[];
  /** Cash the customer pays the courier for THIS package (COD only; MIVO books it). */
  codAmount: string | null;
  /** Where to drop the parcel. Null address = MIVO will tell them. */
  hub: { address: string | null; hours: string | null };
}): Email {
  const first = d.items[0]?.title ?? "an item";
  const more = d.items.length > 1 ? ` and ${d.items.length - 1} more` : "";
  const hubHtml = d.hub.address
    ? `<strong>MIVO Hub:</strong> ${esc(d.hub.address)}${d.hub.hours ? `<br>Drop-off: ${esc(d.hub.hours)}` : ""}`
    : "MIVO will tell you where to drop it off.";
  const hubText = d.hub.address ? `MIVO Hub: ${d.hub.address}${d.hub.hours ? ` (drop-off: ${d.hub.hours})` : ""}` : "MIVO will tell you where to drop it off.";

  return {
    to: d.to,
    subject: `New Order on MIVO! ${first}${more} (${d.orderRef})`,
    html: layout({
      preheader: `You have a new order for ${first}${more}. Please pack it and drop it at the MIVO Hub.`,
      heading: "New Order on MIVO!",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.shopName)}, you have a new order for <strong>${esc(first)}</strong>${esc(more)}. Please pack it within 2 days. MIVO sends it to the customer.</p>` +
        `<p style="margin:0;color:${C.grey};font-size:13px">Order ${esc(d.orderRef)}</p>` +
        itemTable(d.items) +
        box(
          `<strong>What to do:</strong><br>1. Pack the items and write <strong>${esc(d.orderRef)}</strong> on the parcel.<br>` +
            `2. Press <strong>Packed, Ready for MIVO</strong> on your orders page.<br>3. Drop the parcel at the MIVO Hub.<br><br>${hubHtml}`,
        ) +
        `<p style="margin:12px 0 0;font-size:14px">MIVO books and pays the courier and sends the customer the tracking number.` +
        (d.codAmount ? ` This is cash on delivery: the customer pays <strong>${esc(lkr(d.codAmount))}</strong> to the courier, and it comes to MIVO.` : " This order is already paid.") +
        `</p>`,
      cta: { label: "Open my orders", href: appUrl("/seller/orders") },
    }),
    text: [
      "New Order on MIVO!",
      "",
      `Hi ${d.shopName}, you have a new order for ${first}${more}. Please pack it within 2 days. MIVO sends it to the customer.`,
      "",
      `Order ${d.orderRef}`,
      itemLines(d.items),
      "",
      `1. Pack the items and write ${d.orderRef} on the parcel.`,
      "2. Press \"Packed, Ready for MIVO\" on your orders page.",
      "3. Drop the parcel at the MIVO Hub.",
      hubText,
      "",
      `MIVO books and pays the courier and sends the customer the tracking number.${d.codAmount ? ` Cash on delivery: the customer pays ${lkr(d.codAmount)} to the courier.` : " This order is already paid."}`,
      "",
      `Your orders: ${appUrl("/seller/orders")}`,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Buyer, order placed (receipt)

export function buyerOrderPlacedEmail(
  d: {
    to: string;
    name: string;
    orderId: string;
    orderRef: string;
    items: Item[];
    total: string;
    paymentMethod: "COD" | "BANK_TRANSFER";
    /** Bank transfer only: where to pay, and by when. */
    bank: { bankName: string; branch: string; accountName: string; accountNumber: string } | null;
    deadline: string | null;
    /** No account: the link in this email is the only way back to the order. */
    guest: boolean;
  } & BuyerLink,
): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  const bankHtml = d.bank
    ? box(
        `Bank: <strong>${esc(d.bank.bankName)}</strong> (${esc(d.bank.branch)})<br>` +
          `Account name: <strong>${esc(d.bank.accountName)}</strong><br>` +
          `Account number: <strong style="font-family:monospace">${esc(d.bank.accountNumber)}</strong><br>` +
          `Amount: <strong>${esc(lkr(d.total))}</strong><br>` +
          `Reference: <strong style="font-family:monospace">${esc(d.orderRef)}</strong>`,
      ) +
      `<p style="margin:12px 0 0;font-size:14px;color:#b42318"><strong>Important: write ${esc(d.orderRef)} on the bank slip or in the transfer remarks.</strong> Slips without the order number will be rejected.</p>` +
      `<p style="margin:12px 0 0;font-size:14px">After transferring, upload a photo of your bank slip on your order page${d.deadline ? ` by <strong>${esc(d.deadline)}</strong>` : ""}. Unpaid orders are cancelled automatically after that.</p>`
    : `<p style="margin:12px 0 0">Cash on delivery: please keep <strong>${esc(lkr(d.total))}</strong> ready for the courier.</p>`;
  const guestHtml = d.guest
    ? `<p style="margin:16px 0 0;font-size:13px;color:${C.grey}">Keep this email: the button below opens your order, no account needed. Don't forward it, as anyone with the link can see your order.</p>`
    : "";
  return {
    to: d.to,
    subject: `Order received: ${d.orderRef}`,
    html: layout({
      brand: d.brand,
      preheader: d.bank ? `Transfer ${lkr(d.total)} with reference ${d.orderRef}.` : `Total ${lkr(d.total)}, cash on delivery.`,
      heading: "Thank you for your order!",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, we've received your order <strong>${esc(d.orderRef)}</strong>.</p>` +
        itemTable(d.items) +
        `<p style="margin:0">Total (incl. delivery): <strong>${esc(lkr(d.total))}</strong></p>` +
        bankHtml +
        guestHtml,
      cta: { label: d.bank ? "Pay and upload slip" : "View my order", href: link },
    }),
    text: [
      "Thank you for your order!",
      "",
      `Hi ${d.name}, we've received your order ${d.orderRef}.`,
      itemLines(d.items),
      `Total (incl. delivery): ${lkr(d.total)}`,
      d.bank
        ? `${NL}Pay by bank transfer: ${d.bank.bankName} (${d.bank.branch}), ${d.bank.accountName}, ${d.bank.accountNumber}. Reference: ${d.orderRef} (write it on the slip or in the transfer remarks; slips without it will be rejected).${d.deadline ? ` Upload your slip by ${d.deadline}.` : ""}`
        : `${NL}Cash on delivery: keep ${lkr(d.total)} ready for the courier.`,
      d.guest ? `${NL}Keep this email: the link opens your order, no account needed. Don't forward it.` : "",
      "",
      `Your order: ${link}`,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Trigger 2: buyer, one package dispatched

export function buyerPackageDispatchedEmail(d: {
  to: string;
  name: string;
  orderId: string;
  orderRef: string;
  shopName: string;
  courier: string;
  tracking: string;
  items: Item[];
  /** How many packages the order has in total (to explain separate deliveries). */
  packageCount: number;
  /** Cash to pay this courier (COD only). */
  codAmount: string | null;
} & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Package from ${d.shopName} is on the way! (${d.orderRef})`,
    html: layout({
      brand: d.brand,
      preheader: `Courier: ${d.courier}, Tracking: ${d.tracking}`,
      heading: `Package from ${d.shopName} is on the way!`,
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, ${esc(d.shopName)} has handed your package for order <strong>${esc(d.orderRef)}</strong> to the courier.</p>` +
        box(`Courier: <strong>${esc(d.courier)}</strong><br>Tracking: <strong style="font-family:monospace;font-size:15px">${esc(d.tracking)}</strong>`) +
        itemTable(d.items) +
        (d.codAmount
          ? `<p style="margin:12px 0 0">Cash on delivery: please pay this courier <strong>${esc(lkr(d.codAmount))}</strong> for this package.</p>`
          : "") +
        (d.packageCount > 1
          ? `<p style="margin:12px 0 0;font-size:14px;color:${C.grey}">Your order has ${esc(d.packageCount)} packages from different boutiques. They travel separately and may arrive on different days.</p>`
          : ""),
      cta: { label: "Track my order", href: link },
    }),
    text: [
      `Package from ${d.shopName} is on the way!`,
      "",
      `Hi ${d.name}, ${d.shopName} has handed your package for order ${d.orderRef} to the courier.`,
      "",
      `Courier: ${d.courier}`,
      `Tracking: ${d.tracking}`,
      itemLines(d.items),
      d.codAmount ? `${NL}Cash on delivery: please pay this courier ${lkr(d.codAmount)}.` : "",
      d.packageCount > 1 ? `${NL}Your order has ${d.packageCount} packages; they may arrive on different days.` : "",
      "",
      `View your order: ${link}`,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Trigger 3: buyer, payment verified

export function buyerPaymentVerifiedEmail(d: { to: string; name: string; orderId: string; orderRef: string; amount: string } & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Payment verified for your MIVO order (${d.orderRef})`,
    html: layout({
      brand: d.brand,
      preheader: "Your payment has been verified and your order is being prepared.",
      heading: "Payment verified",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, your payment has been verified and your order is being prepared.</p>` +
        box(`Order: <strong>${esc(d.orderRef)}</strong><br>Amount received: <strong>${esc(lkr(d.amount))}</strong>`) +
        `<p style="margin:12px 0 0;font-size:14px">The boutiques are packing your items now. Each boutique ships its own package, and we'll email you the courier and tracking number for each one as it leaves.</p>`,
      cta: { label: "View my order", href: link },
    }),
    text: [
      "Payment verified",
      "",
      `Hi ${d.name}, your payment has been verified and your order is being prepared.`,
      "",
      `Order: ${d.orderRef}`,
      `Amount received: ${lkr(d.amount)}`,
      "",
      `View your order: ${link}`,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Buyer, bank slip rejected

export function buyerSlipRejectedEmail(
  d: { to: string; name: string; orderId: string; orderRef: string; amount: string; reason: string; deadline: string } & BuyerLink,
): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Please send a new payment slip for your MIVO order (${d.orderRef})`,
    html: layout({
      brand: d.brand,
      preheader: "We couldn't confirm your payment from the slip you sent.",
      heading: "We couldn't confirm your payment",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, we checked the bank slip you uploaded and couldn't confirm your payment.</p>` +
        box(`Reason: <strong>${esc(d.reason)}</strong><br>Order: <strong>${esc(d.orderRef)}</strong><br>Amount due: <strong>${esc(lkr(d.amount))}</strong>`) +
        `<p style="margin:12px 0 0;font-size:14px">If you have paid, please upload a clear photo of the slip that shows the order number <strong>${esc(d.orderRef)}</strong>, together with the bank's transaction reference number. If you haven't paid yet, please pay with <strong>${esc(d.orderRef)}</strong> as the reference.</p>` +
        `<p style="margin:12px 0 0;font-size:14px">Please do this by <strong>${esc(d.deadline)}</strong>. After that the order is cancelled and the items go back on sale.</p>`,
      cta: { label: "Upload a new slip", href: link },
    }),
    text: [
      "We couldn't confirm your payment",
      "",
      `Hi ${d.name}, we checked the bank slip you uploaded and couldn't confirm your payment.`,
      "",
      `Reason: ${d.reason}`,
      `Order: ${d.orderRef}`,
      `Amount due: ${lkr(d.amount)}`,
      "",
      `If you have paid, please upload a clear photo of the slip that shows the order number ${d.orderRef}, with the bank's transaction reference number. If you haven't paid yet, please pay with ${d.orderRef} as the reference.`,
      `Please do this by ${d.deadline}. After that the order is cancelled and the items go back on sale.`,
      "",
      `Upload a new slip: ${link}`,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Seller onboarding

export function sellerApplicationReceivedEmail(d: { to: string; shopName: string }): Email {
  return {
    to: d.to,
    subject: `We received your MIVO boutique application (${d.shopName})`,
    html: layout({
      preheader: "Thanks for applying to sell on MIVO.",
      heading: "Thanks for applying!",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.shopName)}, thanks for applying to sell on MIVO. Our team will review your boutique, usually within 2 working days.</p>` +
        `<p style="margin:0;font-size:14px">Meanwhile you can log in, add your bank details and start listing products. They'll appear in the shop as soon as you're approved.</p>`,
      cta: { label: "Open my dashboard", href: appUrl("/seller/dashboard") },
    }),
    text: [
      "Thanks for applying!",
      "",
      `Hi ${d.shopName}, thanks for applying to sell on MIVO. We'll review your boutique, usually within 2 working days.`,
      "You can already log in, add your bank details and list products. They'll go live once you're approved.",
      "",
      appUrl("/seller/dashboard"),
    ].join(NL),
  };
}

export function adminNewSellerEmail(d: { to: string; shopName: string; email: string; instagramUrl: string | null }): Email {
  return {
    to: d.to,
    subject: `New boutique application: ${d.shopName}`,
    html: layout({
      preheader: `${d.shopName} applied to sell on MIVO.`,
      heading: "New boutique application",
      bodyHtml: box(
        `Shop: <strong>${esc(d.shopName)}</strong><br>Email: ${esc(d.email)}<br>Instagram: ${d.instagramUrl ? esc(d.instagramUrl) : "not given"}`,
      ),
      cta: { label: "Review boutiques", href: appUrl("/admin") },
    }),
    text: [`New boutique application: ${d.shopName}`, `Email: ${d.email}`, `Instagram: ${d.instagramUrl ?? "not given"}`, appUrl("/admin")].join(NL),
  };
}

export function sellerApprovedEmail(d: { to: string; shopName: string }): Email {
  return {
    to: d.to,
    subject: `${d.shopName} is approved on MIVO!`,
    html: layout({
      preheader: "Your products are now visible to shoppers.",
      heading: "You're approved!",
      bodyHtml:
        `<p style="margin:0 0 8px">Great news, ${esc(d.shopName)}: your boutique is approved. Your active products are now visible in the MIVO shop.</p>` +
        `<p style="margin:0;font-size:14px">Make sure your stock and bank details are up to date so orders and payouts go smoothly.</p>`,
      cta: { label: "Go to my dashboard", href: appUrl("/seller/dashboard") },
    }),
    text: [`${d.shopName} is approved on MIVO!`, "", "Your active products are now visible to shoppers.", appUrl("/seller/dashboard")].join(NL),
  };
}

// ---------------------------------------------------------------- Cancellations

export function sellerOrderCancelledEmail(d: {
  to: string;
  shopName: string;
  orderRef: string;
  items: Item[];
  by: "BUYER" | "ADMIN";
  /** The package was already handed to a courier (admin cancellations only). */
  alreadySent: boolean;
}): Email {
  const who = d.by === "BUYER" ? "The customer has cancelled" : "MIVO has cancelled";
  const action = d.alreadySent
    ? 'Your package is already with the courier. Please ask the courier to return it to you, then press "Back in stock" on your Orders page.'
    : "Please don't pack or send these items. They are back in your stock.";
  return {
    to: d.to,
    subject: `Order cancelled: don't send ${d.orderRef}`,
    html: layout({
      preheader: `${who} order ${d.orderRef}.`,
      heading: "Order cancelled: don't send",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.shopName)}, ${esc(who)} order <strong>${esc(d.orderRef)}</strong>.</p>` +
        itemTable(d.items) +
        box(`<strong>${esc(action)}</strong>`),
      cta: { label: "View my orders", href: appUrl("/seller/orders?tab=all") },
    }),
    text: [`Order cancelled: don't send ${d.orderRef}`, "", `Hi ${d.shopName}, ${who} order ${d.orderRef}.`, itemLines(d.items), "", action].join(NL),
  };
}

export function buyerOrderCancelledEmail(d: {
  to: string;
  name: string;
  orderId: string;
  orderRef: string;
  by: "BUYER" | "ADMIN";
  reason: string | null;
  /** Amount MIVO will refund for this cancellation, or null if nothing was paid. */
  refund: string | null;
} & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  const intro =
    d.by === "BUYER"
      ? "your order has been cancelled as you requested."
      : d.reason
        ? `MIVO has cancelled your order. Reason: ${d.reason}.`
        : "MIVO has cancelled your order.";
  const money = d.refund
    ? `If your transfer of ${lkr(d.refund)} reached us, we'll refund it to your bank account. Our team will contact you to arrange this.`
    : "You haven't been charged anything.";
  return {
    to: d.to,
    subject: `Your MIVO order ${d.orderRef} is cancelled`,
    html: layout({
      brand: d.brand,
      preheader: money,
      heading: "Order cancelled",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, ${esc(intro)}</p>` +
        box(`Order: <strong>${esc(d.orderRef)}</strong><br>${esc(money)}`),
      cta: { label: "View order", href: link },
    }),
    text: ["Order cancelled", "", `Hi ${d.name}, ${intro}`, "", `Order: ${d.orderRef}`, money, "", link].join(NL),
  };
}

// ---------------------------------------------------------------- Tracking correction

export function buyerTrackingUpdatedEmail(d: {
  to: string;
  name: string;
  orderId: string;
  orderRef: string;
  shopName: string;
  courier: string;
  tracking: string;
} & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Updated tracking for your package from ${d.shopName} (${d.orderRef})`,
    html: layout({
      brand: d.brand,
      preheader: `Courier: ${d.courier}, Tracking: ${d.tracking}`,
      heading: "Updated tracking number",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, the tracking details for your package from ${esc(d.shopName)} (order <strong>${esc(d.orderRef)}</strong>) were corrected. Please use these instead:</p>` +
        box(`Courier: <strong>${esc(d.courier)}</strong><br>Tracking: <strong style="font-family:monospace;font-size:15px">${esc(d.tracking)}</strong>`),
      cta: { label: "Track my order", href: link },
    }),
    text: ["Updated tracking number", "", `Hi ${d.name}, the tracking for your package from ${d.shopName} (${d.orderRef}) was corrected:`, `Courier: ${d.courier}`, `Tracking: ${d.tracking}`, "", link].join(NL),
  };
}

// ---------------------------------------------------------------- One package cancelled / returned

export function sellerPackageResolvedEmail(d: {
  to: string;
  shopName: string;
  orderRef: string;
  items: Item[];
  kind: "CANCELLED" | "RETURNED";
  reason: string;
  wasDispatched: boolean;
  restocked: boolean;
  /** Already paid for this package: amount deducted from the next payout. */
  clawback: string | null;
}): Email {
  const heading = d.kind === "CANCELLED" ? "Package cancelled: don't send" : "Package returned by the customer";
  const lines: string[] = [];
  if (d.kind === "CANCELLED") {
    lines.push(d.wasDispatched ? "Your package is with the courier. Please ask the courier to return it to you." : "Please don't pack or send these items.");
  } else {
    lines.push(
      d.clawback
        ? `The customer returned this package. You were already paid for it, so ${lkr(d.clawback)} will be deducted from your next payout.`
        : "The customer returned this package. You won't be paid for these items.",
    );
  }
  lines.push(
    d.restocked
      ? "The items have been put back into your stock."
      : 'When the items are back with you, press "Back in stock" on your Orders page.',
  );
  return {
    to: d.to,
    subject: `${heading} (${d.orderRef})`,
    html: layout({
      preheader: `${heading}: ${d.reason}`,
      heading,
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.shopName)}, MIVO has ${d.kind === "CANCELLED" ? "cancelled" : "recorded a return of"} your package for order <strong>${esc(d.orderRef)}</strong>.</p>` +
        box(`Reason: <strong>${esc(d.reason)}</strong>`) +
        itemTable(d.items) +
        lines.map((l) => `<p style="margin:8px 0 0;font-size:14px">${esc(l)}</p>`).join(""),
      cta: { label: "View my orders", href: appUrl("/seller/orders?tab=all") },
    }),
    text: [heading, "", `Hi ${d.shopName}, order ${d.orderRef}.`, `Reason: ${d.reason}`, itemLines(d.items), "", ...lines].join(NL),
  };
}

export function buyerPackageResolvedEmail(d: {
  to: string;
  name: string;
  orderId: string;
  orderRef: string;
  shopName: string;
  kind: "CANCELLED" | "RETURNED";
  reason: string;
  refund: string | null;
} & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  const what =
    d.kind === "CANCELLED"
      ? `the package from ${d.shopName} in your order ${d.orderRef} was cancelled. The rest of your order isn't affected.`
      : `we've recorded the return of your package from ${d.shopName} (order ${d.orderRef}).`;
  const money = d.refund
    ? `We'll refund ${lkr(d.refund)} to your bank account. Our team will contact you to arrange this.`
    : "You won't be charged for it.";
  return {
    to: d.to,
    subject: `${d.kind === "CANCELLED" ? "Part of your order was cancelled" : "Your return was received"} (${d.orderRef})`,
    html: layout({
      brand: d.brand,
      preheader: money,
      heading: d.kind === "CANCELLED" ? "Part of your order was cancelled" : "Return received",
      bodyHtml: `<p style="margin:0 0 8px">Hi ${esc(d.name)}, ${esc(what)}</p>` + box(`Reason: ${esc(d.reason)}<br>${esc(money)}`),
      cta: { label: "View order", href: link },
    }),
    text: [`Hi ${d.name}, ${what}`, `Reason: ${d.reason}`, money, "", link].join(NL),
  };
}

// ---------------------------------------------------------------- Unpaid bank transfer reminder

export function buyerPaymentReminderEmail(d: {
  to: string;
  name: string;
  orderId: string;
  orderRef: string;
  amount: string;
  deadline: string;
} & BuyerLink): Email {
  const link = appUrl(d.orderPath ?? `/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Reminder: complete your payment for ${d.orderRef}`,
    html: layout({
      brand: d.brand,
      preheader: `Please transfer ${lkr(d.amount)} by ${d.deadline} or the order will be cancelled.`,
      heading: "Complete your payment",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, we haven't received the bank transfer for your order <strong>${esc(d.orderRef)}</strong> yet.</p>` +
        box(`Amount: <strong>${esc(lkr(d.amount))}</strong><br>Reference: <strong>${esc(d.orderRef)}</strong><br>Pay by: <strong>${esc(d.deadline)}</strong>`) +
        `<p style="margin:12px 0 0;font-size:14px">After transferring, upload your bank slip on the order page. If we don't receive it by then, the order is cancelled automatically and the items go back on sale.</p>`,
      cta: { label: "Pay and upload slip", href: link },
    }),
    text: [
      "Complete your payment",
      "",
      `Hi ${d.name}, we haven't received the bank transfer for ${d.orderRef} yet.`,
      `Amount: ${lkr(d.amount)} · Reference: ${d.orderRef} · Pay by: ${d.deadline}`,
      "Upload your slip on the order page, or the order is cancelled automatically.",
      link,
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Password reset

export function passwordResetEmail(d: { to: string; name: string; link: string; minutes: number }): Email {
  return {
    to: d.to,
    subject: "Reset your MIVO password",
    html: layout({
      preheader: `This link works for ${d.minutes} minutes.`,
      heading: "Reset your password",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, we received a request to reset the password for your MIVO account.</p>` +
        `<p style="margin:0;font-size:14px">The link works once, for ${esc(d.minutes)} minutes. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
      cta: { label: "Choose a new password", href: d.link },
    }),
    text: [
      "Reset your password",
      "",
      `Hi ${d.name}, open this link to choose a new MIVO password (works once, for ${d.minutes} minutes):`,
      d.link,
      "",
      "If you didn't ask for this, ignore this email.",
    ].join(NL),
  };
}

// ---------------------------------------------------------------- Email confirmation

export function confirmEmailEmail(d: { to: string; name: string; link: string; hours: number }): Email {
  return {
    to: d.to,
    subject: "Confirm your email for MIVO",
    html: layout({
      preheader: "One click to confirm your email address.",
      heading: "Confirm your email",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.name)}, please confirm this is your email address. We use it for your order updates and receipts.</p>` +
        `<p style="margin:0;font-size:14px">The link works for ${esc(d.hours)} hours. If you didn&#39;t create a MIVO account, ignore this email.</p>`,
      cta: { label: "Confirm my email", href: d.link },
    }),
    text: ["Confirm your email", "", `Hi ${d.name}, confirm your MIVO email address (link works for ${d.hours} hours):`, d.link].join(NL),
  };
}
