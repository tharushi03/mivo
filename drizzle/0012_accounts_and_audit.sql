CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_id" varchar(64),
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" varchar(255) NOT NULL,
	"shipment_id" uuid,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD COLUMN "adjustment_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "restocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspend_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_adjustments" ADD CONSTRAINT "seller_adjustments_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_adjustments" ADD CONSTRAINT "seller_adjustments_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_adjustments" ADD CONSTRAINT "seller_adjustments_payout_id_seller_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_actions_target_idx" ON "admin_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "seller_adjustments_seller_idx" ON "seller_adjustments" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_adjustments_shipment_idx" ON "seller_adjustments" USING btree ("shipment_id");--> statement-breakpoint
-- Accounts that existed before email confirmation are treated as confirmed.
UPDATE "users" SET "email_verified" = "created_at" WHERE "email_verified" IS NULL;--> statement-breakpoint
-- Cancelled / returned packages from before restock tracking were already restocked.
UPDATE "shipments" SET "restocked_at" = now() WHERE "status"::text IN ('CANCELLED', 'RETURNED') AND "restocked_at" IS NULL;
