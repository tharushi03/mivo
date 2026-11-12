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

const NL = "\n";
const itemLines = (items: Item[]) => items.map((i) => `- ${i.title}, size ${i.size} x ${i.quantity}`).join(NL);

/** Wraps content in the MIVO email shell. `bodyHtml` must already be escaped. */
function layout(opts: { preheader: string; heading: string; bodyHtml: string; cta?: { label: string; href: string } }) {
  const button = opts.cta
    ? `<p style="margin:28px 0 8px"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;background:${C.cream};font-family:Helvetica,Arial,sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.muted};border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:3px solid ${C.accent}"><span style="font-size:22px;font-weight:700;letter-spacing:5px">MIVO</span></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${esc(opts.heading)}</h1>
${opts.bodyHtml}
${button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${C.muted};font-size:12px;color:${C.grey}">MIVO · Curated clothing from Sri Lankan boutiques<br>This is an automatic message about your MIVO order.</td></tr>
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

// ---------------------------------------------------------------- Trigger 1: seller, new order to ship

export function sellerNewOrderEmail(d: {
  to: string;
  shopName: string;
  orderRef: string;
  items: Item[];
  shipTo: { name: string; address: string; phone: string };
  /** Cash the courier must collect for THIS package (COD only). */
  codAmount: string | null;
  /** Delivery fee for this package (repaid with the payout on prepaid orders). */
  deliveryFee: string;
  /** COD only: couriers where MIVO has an account, and how to book on it. */
  codCouriers: { name: string; accountNumber: string | null; bookingInstructions: string | null }[];
}): Email {
  const first = d.items[0]?.title ?? "an item";
  const codHtml = d.codCouriers
    .map(
      (c) =>
        `<li style="margin:6px 0"><strong>${esc(c.name)}</strong>: MIVO account <strong>${esc(c.accountNumber ?? "ask MIVO")}</strong>` +
        (c.bookingInstructions ? `<br><span style="color:${C.grey}">${esc(c.bookingInstructions).split(NL).join("<br>")}</span>` : "") +
        `</li>`,
    )
    .join("");
  const codText = d.codCouriers.map(
    (c) => `- ${c.name}: MIVO account ${c.accountNumber ?? "(ask MIVO)"}${c.bookingInstructions ? `. ${c.bookingInstructions.split(NL).join(" ")}` : ""}`,
  );
  const more = d.items.length > 1 ? ` and ${d.items.length - 1} more` : "";
  const addressHtml = esc(d.shipTo.address).split(NL).join("<br>");

  return {
    to: d.to,
    subject: `New Order on MIVO! ${first}${more} (${d.orderRef})`,
    html: layout({
      preheader: `You have a new order for ${first}${more}. Please pack it and ship it to the customer.`,
      heading: "New Order on MIVO!",
      bodyHtml:
        `<p style="margin:0 0 8px">Hi ${esc(d.shopName)}, you have a new order for <strong>${esc(first)}</strong>${esc(more)}. Please pack it and ship it directly to the customer.</p>` +
        `<p style="margin:0;color:${C.grey};font-size:13px">Order ${esc(d.orderRef)}</p>` +
        itemTable(d.items) +
        box(`<strong>Ship to:</strong><br>${esc(d.shipTo.name)}<br>${addressHtml}<br>Phone: ${esc(d.shipTo.phone)}`) +
        (d.codAmount
          ? box(
              `<strong>Cash on delivery:</strong> the courier must collect <strong>${esc(lkr(d.codAmount))}</strong> for this package.` +
                `<br>Book it on <strong>MIVO&#39;s account</strong> (not your own), so the cash comes to MIVO. Use <strong>${esc(d.orderRef)}</strong> as the reference and <strong>${esc(lkr(d.codAmount))}</strong> as the COD amount.` +
                (codHtml
                  ? `<ul style="margin:8px 0 0;padding-left:18px">${codHtml}</ul>`
                  : `<br><strong>No courier is set up for cash on delivery yet. Please contact MIVO before sending it.</strong>`),
            )
          : `<p style="margin:12px 0 0;font-size:14px">This order is already paid, so the courier collects nothing. Book it with any courier: MIVO repays the ${esc(lkr(d.deliveryFee))} delivery fee with your payout.</p>`) +
        `<p style="margin:12px 0 0;font-size:14px">After handing the package to the courier, open your dashboard and enter the <strong>courier and tracking number</strong>. We'll email the customer.</p>`,
      cta: { label: "Ship this order", href: appUrl("/seller/orders") },
    }),
    text: [
      "New Order on MIVO!",
      "",
      `Hi ${d.shopName}, you have a new order for ${first}${more}. Please pack it and ship it directly to the customer.`,
      "",
      `Order ${d.orderRef}`,
      itemLines(d.items),
      "",
      `Ship to: ${d.shipTo.name}, ${d.shipTo.address.split(NL).join(", ")}, ${d.shipTo.phone}`,
      ...(d.codAmount
        ? [
            `Cash on delivery: courier collects ${lkr(d.codAmount)}.`,
            `Book it on MIVO's account (not your own), with reference ${d.orderRef} and COD amount ${lkr(d.codAmount)}:`,
            ...(codText.length ? codText : ["No courier is set up for cash on delivery yet. Please contact MIVO before sending it."]),
          ]
        : [`Already paid: courier collects nothing. Book any courier; MIVO repays the ${lkr(d.deliveryFee)} delivery fee with your payout.`]),
      "",
      `Then enter the courier and tracking number: ${appUrl("/seller/orders")}`,
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
}): Email {
  const link = appUrl(`/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Package from ${d.shopName} is on the way! (${d.orderRef})`,
    html: layout({
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

export function buyerPaymentVerifiedEmail(d: { to: string; name: string; orderId: string; orderRef: string; amount: string }): Email {
  const link = appUrl(`/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Payment verified for your MIVO order (${d.orderRef})`,
    html: layout({
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
}): Email {
  const link = appUrl(`/order/${d.orderId}`);
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
}): Email {
  const link = appUrl(`/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Updated tracking for your package from ${d.shopName} (${d.orderRef})`,
    html: layout({
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
}): Email {
  const link = appUrl(`/order/${d.orderId}`);
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
}): Email {
  const link = appUrl(`/order/${d.orderId}`);
  return {
    to: d.to,
    subject: `Reminder: complete your payment for ${d.orderRef}`,
    html: layout({
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
