CREATE TYPE "public"."hub_status" AS ENUM('PENDING_PICKUP', 'IN_TRANSIT_TO_HUB', 'AT_HUB', 'DISPATCHED_TO_CUSTOMER', 'DELIVERED');--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "received_at_hub_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hub_status" "hub_status" DEFAULT 'PENDING_PICKUP' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "final_courier_name" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "final_tracking_number" varchar(100);--> statement-breakpoint
UPDATE "orders" SET "final_courier_name" = "courier_name", "final_tracking_number" = "tracking_number";
--> statement-breakpoint
UPDATE "orders" SET "hub_status" = CASE "order_status" WHEN 'DELIVERED' THEN 'DELIVERED'::hub_status WHEN 'DISPATCHED' THEN 'DISPATCHED_TO_CUSTOMER'::hub_status ELSE 'PENDING_PICKUP'::hub_status END;
