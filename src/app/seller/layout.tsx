import { SectionNav } from "@/components/section-nav";

export default function SellerLayout({ children }: LayoutProps<"/seller">) {
  return (
    <>
      <SectionNav
        label="Seller"
        links={[
          { href: "/seller/dashboard", label: "Overview" },
          { href: "/seller/orders", label: "Orders" },
          { href: "/seller/products/new", label: "Add product" },
          { href: "/seller/payouts", label: "My Payouts" },
          { href: "/seller/settings", label: "Store Settings" },
        ]}
      />
      {children}
    </>
  );
}
