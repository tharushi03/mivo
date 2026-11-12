CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size" varchar(20) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variants_stock_non_negative" CHECK ("product_variants"."stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD COLUMN "bank_account_name" varchar(255);--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD COLUMN "bank_account_number" varchar(100);--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "bank_branch" varchar(100);--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "bank_account_name" varchar(255);--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "bank_details_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_size_idx" ON "product_variants" USING btree ("product_id","size");--> statement-breakpoint
-- Hand-added: move existing stock into one variant row per size BEFORE the old
-- columns are dropped. The old schema had one total per product, so it is split
-- as evenly as possible across its sizes (the total stays the same; earlier sizes
-- get the remainder). Sellers can correct the split afterwards.
INSERT INTO "product_variants" ("product_id", "size", "stock", "position")
SELECT p."id",
       s."size",
       (p."stock_quantity" / cardinality(p."sizes"))
         + CASE WHEN s."ord" <= p."stock_quantity" % cardinality(p."sizes") THEN 1 ELSE 0 END,
       s."ord" - 1
FROM "products" p
CROSS JOIN LATERAL unnest(p."sizes") WITH ORDINALITY AS s("size", "ord")
WHERE cardinality(p."sizes") > 0
ON CONFLICT ("product_id", "size") DO NOTHING;--> statement-breakpoint
-- Products that somehow had no sizes keep their stock as a single "FREE SIZE".
INSERT INTO "product_variants" ("product_id", "size", "stock", "position")
SELECT p."id", 'FREE SIZE', p."stock_quantity", 0
FROM "products" p
WHERE cardinality(p."sizes") = 0 OR p."sizes" IS NULL;--> statement-breakpoint
-- Existing bank account numbers count as "set" now (no recent-change warning).
UPDATE "seller_profiles" SET "bank_details_updated_at" = "created_at" WHERE "bank_account_number" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "sizes";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock_quantity";