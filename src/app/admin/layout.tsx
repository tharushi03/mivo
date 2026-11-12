import { SectionNav } from "@/components/section-nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <SectionNav
        label="Admin"
        links={[
          { href: "/admin/orders", label: "Orders" },
          { href: "/admin/shipments", label: "Shipments" },
          { href: "/admin/couriers", label: "Couriers" },
          { href: "/admin/payouts", label: "Payouts" },
          { href: "/admin", label: "Boutiques" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/activity", label: "Activity" },
        ]}
      />
      {children}
    </>
  );
}
