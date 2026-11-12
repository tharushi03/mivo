import { revalidatePath } from "next/cache";

/** Every page that shows an order, its packages or money derived from them. */
export function refreshOrderPages(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/payouts");
  revalidatePath("/seller/orders");
  revalidatePath("/seller/dashboard");
  revalidatePath("/seller/payouts");
  revalidatePath("/orders");
  revalidatePath(`/order/${orderId}`);
}
