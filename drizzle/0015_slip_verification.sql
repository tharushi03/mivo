ALTER TABLE "orders" ADD COLUMN "slip_reference" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slip_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slip_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slip_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slip_reject_reason" varchar(200);--> statement-breakpoint
CREATE INDEX "orders_slip_hash_idx" ON "orders" USING btree ("slip_hash");--> statement-breakpoint
CREATE INDEX "orders_slip_reference_idx" ON "orders" USING btree ("slip_reference");--> statement-breakpoint
-- Slips uploaded before this column existed: use the order time, so they come first in the queue.
UPDATE "orders" SET "slip_uploaded_at" = "created_at" WHERE "payment_slip_url" IS NOT NULL;
