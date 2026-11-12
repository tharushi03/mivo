import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data MIVO collects, why, and your rights.",
};

// Placeholder policy that describes the data this app really stores. Have it
// reviewed against Sri Lanka's Personal Data Protection Act No. 9 of 2022.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal information MIVO collects, how we use it, and the choices you have. We
          follow the principles of Sri Lanka&apos;s Personal Data Protection Act No. 9 of 2022. See also our{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      }
    >
      <Section title="What we collect">
        <ul>
          <li><strong>Account details:</strong> your name, email address and password (stored only as a secure one-way hash, never in readable form).</li>
          <li><strong>Order details:</strong> the recipient name, delivery address, phone number, items ordered and payment method.</li>
          <li><strong>Payment proof:</strong> bank transfer slips you upload. We do not collect or store card numbers.</li>
          <li><strong>Reviews</strong> you write.</li>
          <li>
            <strong>For boutiques:</strong> owner name, shop name and Instagram page (to review your application), and
            bank name, branch, account holder name and account number (used only to pay you).
          </li>
          <li><strong>Technical data:</strong> your IP address, used briefly to block repeated failed logins, plus a sign-in cookie that keeps you logged in.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To process, deliver and support your orders, and to send order emails (payment confirmed, order dispatched).</li>
          <li>To verify bank transfer payments and pay boutiques.</li>
          <li>To keep accounts secure and prevent fraud.</li>
          <li>To meet legal, tax and accounting obligations.</li>
        </ul>
        <p>We do not sell your personal information, and we do not send marketing emails without your permission.</p>
      </Section>

      <Section title="Who we share it with">
        <ul>
          <li>
            <strong>Boutiques</strong> in your order receive the recipient name, delivery address and phone number so they can ship their items to you. They see only their own items, never your email address, other boutiques&apos; items or your payment details, and may use your details only to deliver your order.
          </li>
          <li><strong>Courier companies</strong> receive the recipient name, address and phone number needed to deliver your parcel.</li>
          <li><strong>Service providers</strong> that host the website and send our emails, under confidentiality obligations.</li>
          <li><strong>Authorities</strong> when the law requires it.</li>
        </ul>
        <p>Reviews show only your first name and the initial of your last name.</p>
      </Section>

      <Section title="How we protect it">
        <p>
          Passwords are hashed, bank slips are stored privately and can only be opened by you and MIVO staff, and
          access to the admin area is restricted. No system is perfectly secure, but we take reasonable steps to
          protect your information.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep order and payment records for as long as needed for accounting and tax purposes (usually up to 7
          years), and account details until you ask us to delete your account. Login-protection data (IP address and failed
          attempts) is never saved to our database. It is held only in temporary server memory and expires within an hour.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to see, correct or delete your personal information, or object to how it&apos;s used, by emailing{" "}
          {SITE.supportEmail}. We may need to keep some order records where the law requires it. If you&apos;re not
          satisfied with our response, you can contact the Data Protection Authority of {SITE.country}.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use only the cookies needed for the site to work: one that keeps you signed in, and security cookies used
          during sign-in. Your shopping cart is saved in your own browser. We don&apos;t use advertising or tracking cookies.
        </p>
      </Section>

      <Section title="Changes">
        <p>We may update this policy and will show the new date at the top of this page.</p>
      </Section>
    </LegalPage>
  );
}
