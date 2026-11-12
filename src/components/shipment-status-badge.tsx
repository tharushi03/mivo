import { SHIPMENT_STATUS_LABEL, type ShipmentStatus } from "@/lib/shipments";

const TONE: Record<ShipmentStatus, string> = {
  PENDING: "bg-accent/15 text-accent-hover",
  DISPATCHED: "bg-primary/10 text-primary",
  DELIVERED: "bg-success/15 text-success",
  CANCELLED: "bg-error/10 text-error",
  RETURNED: "bg-muted text-text-secondary",
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONE[status]}`}>
      {SHIPMENT_STATUS_LABEL[status]}
    </span>
  );
}
