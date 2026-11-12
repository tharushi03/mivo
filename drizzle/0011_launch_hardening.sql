CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'REFUNDED', 'VOIDED');--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'RETURNED';--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"reason" varchar(255) NOT NULL,
	"reference" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_title" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_image_url" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "commission_rate" numeric(5, 2);--> statement-breakpoint
-- Backfill existing order items from the product and boutique as they are today (best available).
UPDATE "order_items" oi SET "product_title" = p."title", "product_image_url" = p."image_url", "commission_rate" = sp."commission_rate"
  FROM "products" p JOIN "seller_profiles" sp ON sp."id" = p."seller_id" WHERE p."id" = oi."product_id";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "product_title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "product_image_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "commission_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD COLUMN "delivery_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "resolution_note" varchar(255);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_shipment_idx" ON "refunds" USING btree ("shipment_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_payout_id_seller_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Refunds owed from Phase 14 whole-order cancellations become refund rows.
-- (Compared as text: new enum values can't be used in the same transaction that adds them.)
INSERT INTO "refunds" ("order_id", "amount", "status", "reason", "created_at", "settled_at")
  SELECT "id", "total_amount",
         CASE WHEN "payment_status"::text = 'REFUNDED' THEN 'REFUNDED'::refund_status ELSE 'PENDING'::refund_status END,
         'Order cancelled', coalesce("cancelled_at", now()), "refunded_at"
  FROM "orders" WHERE "payment_status"::text IN ('REFUND_PENDING', 'REFUNDED');