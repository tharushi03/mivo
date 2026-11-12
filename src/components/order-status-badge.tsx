import { STATUS_LABEL } from "@/lib/orders";

const TONE: Record<keyof typeof STATUS_LABEL, string> = {
  PENDING: "bg-accent/15 text-accent-hover",
  PARTIALLY_DISPATCHED: "bg-accent/15 text-accent-hover",
  DISPATCHED: "bg-primary/10 text-primary",
  DELIVERED: "bg-success/15 text-success",
  CANCELLED: "bg-error/10 text-error",
};

export function OrderStatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
