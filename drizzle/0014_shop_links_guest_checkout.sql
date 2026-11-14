ALTER TABLE "orders" ALTER COLUMN "buyer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_email" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "referrer_seller_id" uuid;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "slug" varchar(60);--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "whatsapp_number" varchar(20);--> statement-breakpoint
-- Existing boutiques get a shop link made from their name ("Colombo Batik" -> colombo-batik);
-- a clash gets the first 4 characters of the boutique id added.
UPDATE "seller_profiles" sp SET "slug" = s.slug FROM (
  SELECT id, base || CASE WHEN row_number() OVER (PARTITION BY base ORDER BY created_at, id) = 1 THEN '' ELSE '-' || left(id::text, 4) END AS slug
  FROM (
    SELECT id, created_at,
      coalesce(nullif(left(trim(both '-' from regexp_replace(lower(shop_name), '[^a-z0-9]+', '-', 'g')), 50), ''), 'shop') AS base
    FROM "seller_profiles"
  ) b
) s WHERE sp.id = s.id AND sp."slug" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_referrer_seller_id_seller_profiles_id_fk" FOREIGN KEY ("referrer_seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_guest_email_idx" ON "orders" USING btree ("guest_email");--> statement-breakpoint
CREATE INDEX "orders_referrer_idx" ON "orders" USING btree ("referrer_seller_id");--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_or_guest" CHECK ("orders"."buyer_id" is not null or "orders"."guest_email" is not null);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_bank_transfer_only" CHECK ("orders"."buyer_id" is not null or "orders"."payment_method" = 'BANK_TRANSFER');