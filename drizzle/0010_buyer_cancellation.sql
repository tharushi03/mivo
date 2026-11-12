ALTER TYPE "public"."payment_status" ADD VALUE 'VOIDED';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'REFUND_PENDING';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'REFUNDED';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by" "role";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;