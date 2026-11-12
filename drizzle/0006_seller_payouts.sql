CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'PAID');--> statement-breakpoint
CREATE TABLE "seller_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"gross_amount" numeric(12, 2) NOT NULL,
	"commission_rate" numeric(5, 2) NOT NULL,
	"commission_amount" numeric(12, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"item_count" integer NOT NULL,
	"status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"reference" varchar(100),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_payouts_seller_idx" ON "seller_payouts" USING btree ("seller_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_payout_id_seller_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_payout_idx" ON "order_items" USING btree ("payout_id");