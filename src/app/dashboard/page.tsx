import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The proxy normally handles /dashboard with a 307 before this renders;
// this page is a fallback that does the same redirect.
export const instant = false;

// Sends each user to the right home for their role after login.
export default async function DashboardRedirect() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  switch (session.user.role) {
    case "ADMIN":
      redirect("/admin");
    case "SELLER":
      redirect("/seller/dashboard");
    default:
      redirect("/orders");
  }
}
