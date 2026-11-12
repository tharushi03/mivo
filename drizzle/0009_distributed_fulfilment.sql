-- Phase 13: drop the MIVO hub. Each boutique now ships its own package to the buyer.
-- Hand-written (enum rename + data copy) so existing orders are carried over safely.

-- 1. Couriers
CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "couriers_name_unique" UNIQUE("name")
);--> statement-breakpoint
-- Same names as the old hard-coded list, so old tracking data maps across.
INSERT INTO "couriers" ("name", "sort_order") VALUES
	('Koombiyo', 1), ('Pronto', 2), ('PickMe Flash', 3), ('Domex', 4), ('Prompt Xpress', 5), ('Other', 99);--> statement-breakpoint

-- 2. Shipments
CREATE TYPE "public"."shipment_status" AS ENUM('PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"status" "shipment_status" DEFAULT 'PENDING' NOT NULL,
	"courier_id" uuid,
	"tracking_number" varchar(100),
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_seller_idx" ON "shipments" USING btree ("order_id","seller_id");--> statement-breakpoint
CREATE INDEX "shipments_seller_status_idx" ON "shipments" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "shipments_status_created_idx" ON "shipments" USING btree ("status","created_at");--> statement-breakpoint

-- 3. Carry existing orders over: one shipment per boutique per order.
--    Old hub orders shipped as ONE parcel, so every shipment gets the order's status,
--    courier and tracking number.
INSERT INTO "shipments" ("order_id", "seller_id", "status", "courier_id", "tracking_number", "dispatched_at", "delivered_at", "created_at")
SELECT o."id",
       p."seller_id",
       (CASE o."order_status"
          WHEN 'CANCELLED' THEN 'CANCELLED'
          WHEN 'DELIVERED' THEN 'DELIVERED'
          WHEN 'DISPATCHED' THEN 'DISPATCHED'
          ELSE 'PENDING' END)::"shipment_status",
       CASE WHEN o."order_status" IN ('DISPATCHED', 'DELIVERED')
            THEN (SELECT c."id" FROM "couriers" c WHERE c."name" = o."final_courier_name") END,
       CASE WHEN o."order_status" IN ('DISPATCHED', 'DELIVERED') THEN o."final_tracking_number" END,
       o."dispatched_at",
       o."delivered_at",
       o."created_at"
FROM "orders" o
JOIN "order_items" i ON i."order_id" = o."id"
JOIN "products" p ON p."id" = i."product_id"
GROUP BY o."id", p."seller_id";--> statement-breakpoint
-- Old orders paid one flat delivery fee: attach it to one shipment per order.
UPDATE "shipments" s SET "delivery_fee" = o."delivery_fee"
FROM "orders" o
WHERE o."id" = s."order_id"
  AND s."id" = (SELECT s2."id" FROM "shipments" s2 WHERE s2."order_id" = o."id" ORDER BY s2."seller_id" LIMIT 1);--> statement-breakpoint

-- 4. Order status: PACKING meant "being collected at the hub" = nothing sent to the buyer yet.
UPDATE "orders" SET "order_status" = 'PENDING' WHERE "order_status" = 'PACKING';--> statement-breakpoint
ALTER TYPE "public"."order_status" RENAME VALUE 'PACKING' TO 'PARTIALLY_DISPATCHED';--> statement-breakpoint

-- 5. Remove the hub.
ALTER TABLE "orders" DROP COLUMN "hub_status";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "final_courier_name";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "final_tracking_number";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "packed_at";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "received_at_hub_at";--> statement-breakpoint
DROP TYPE "public"."hub_status";
