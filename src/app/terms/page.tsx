import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for buying and selling on MIVO.",
};

// Placeholder terms written for how MIVO actually works. Have them reviewed by a
// Sri Lankan lawyer before launch.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply when you use MIVO, an online marketplace where independent Sri Lankan boutiques sell
          clothing to customers. By creating an account or placing an order, you agree to them. Please also read our{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
    >
      <Section title="Who we are">
        <p>
          MIVO operates the website and takes payments. Each item is sold by the boutique named on its product page, and that boutique packs and ships it to you directly. MIVO acts on the boutique&apos;s behalf for payment and arranges the courier accounts used for delivery.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>You must give accurate information and be at least 18, or have a parent or guardian&apos;s permission.</li>
          <li>Keep your password private. You are responsible for activity on your account.</li>
          <li>You need to confirm your email address before placing your first order.</li>
          <li>
            To protect accounts, we temporarily block sign-in after repeated wrong passwords. We may suspend accounts
            used for fraud or abuse.
          </li>
        </ul>
      </Section>

      <Section title="Orders and prices">
        <ul>
          <li>All prices are in Sri Lankan Rupees (LKR) and include the boutique&apos;s price. Each boutique ships its own package, so a delivery fee is charged per boutique in your order (shown at checkout).</li>
          <li>
            Your order is confirmed when you see your order number. Stock is checked when you place the order. If an
            item sells out or changes price before that, we will show you and ask you to confirm again.
          </li>
          <li>
            You can cancel your order yourself from your order page until any boutique hands its package to the courier.
            After that, contact us. If you already paid by bank transfer, we refund the full amount to your bank account.
          </li>
          <li>We may cancel an order if an item turns out to be unavailable, or the order looks fraudulent. Any payment made will be refunded.</li>
        </ul>
      </Section>

      <Section title="Payment">
        <ul>
          <li>
            <strong>Bank transfer:</strong> transfer the exact amount using your order number as the reference, then
            upload your bank slip on the order page. We start preparing your order once we confirm the payment. If no
            payment slip is uploaded within 3 days, the order is cancelled automatically (we email you a reminder first).
          </li>
          <li>
            <strong>Cash on delivery:</strong> pay each courier the amount for its package when it arrives (shown on your order page and in the shipping email). Refusing a
            cash-on-delivery parcel without a valid reason may lead to cash on delivery being unavailable on future orders.
            You can have up to 3 cash-on-delivery orders on the way at once.
          </li>
        </ul>
      </Section>

      <Section title="Delivery">
        <p>
          Each boutique in your order packs and ships its items to you separately, using a local courier, so an order with items from several boutiques arrives as several packages, possibly on different days. You will receive the courier name and tracking number for each package by email. Delivery
          times are estimates. Please make sure your address and phone number are correct.
        </p>
      </Section>

      <Section title="Returns and refunds">
        <ul>
          <li>
            You may request a return within <strong>{SITE.returnDays} days of delivery</strong> if an item is faulty,
            damaged, not as described, or the wrong item or size was sent. Contact {SITE.supportEmail} with your order
            number and photos.
          </li>
          <li>
            Items must be unworn, unwashed and returned with their original tags and packaging. For hygiene reasons,
            innerwear, swimwear and items marked &quot;final sale&quot; can&apos;t be returned unless faulty.
          </li>
          <li>
            Change-of-mind returns are at each boutique&apos;s discretion, and the return delivery cost may be deducted.
          </li>
          <li>
            Approved refunds are paid by bank transfer to the account you give us, usually within 14 days of us
            receiving the returned item. The original delivery fee is refunded only if the item was faulty or wrong.
          </li>
        </ul>
      </Section>

      <Section title="Reviews">
        <p>
          Only customers whose order was delivered can review a product, and only their first name and initial are
          shown. Reviews must be honest and about the product. We may remove reviews that are offensive, contain
          personal information, or are not about the product.
        </p>
      </Section>

      <Section title="Selling on MIVO">
        <p>
          Boutiques must be approved by MIVO before their products are shown. Sellers must describe items accurately,
          keep stock levels up to date, ship each order within 2 days of it being ready, and enter the courier and tracking number in their dashboard. Cash-on-delivery packages must be booked on MIVO&apos;s courier accounts; prepaid packages may be sent with
          any courier, and MIVO repays the delivery fee the buyer paid. MIVO deducts the commission rate in force when each
          order was placed and pays the balance to the seller&apos;s bank account once the package has been delivered for{" "}
          {SITE.returnDays} days (the buyer&apos;s return window). Returned items are not paid for. Separate seller terms may apply.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          We work hard to keep MIVO accurate and available, but we can&apos;t guarantee it will always be error-free.
          To the extent allowed by Sri Lankan law, MIVO is not liable for indirect losses. Nothing in these terms
          limits your rights under the Consumer Affairs Authority Act or other consumer protection laws of {SITE.country}.
        </p>
      </Section>

      <Section title="Changes and governing law">
        <p>
          We may update these terms, and will post the new date at the top of this page. These terms are governed by
          the laws of the Democratic Socialist Republic of {SITE.country}, and disputes will be handled by the courts
          of {SITE.country}.
        </p>
      </Section>
    </LegalPage>
  );
}
