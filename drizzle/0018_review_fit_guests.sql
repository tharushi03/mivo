ALTER TABLE "reviews" ALTER COLUMN "buyer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "fit" varchar(10);--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_product_idx" ON "reviews" USING btree ("order_id","product_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_fit_values" CHECK ("reviews"."fit" is null or "reviews"."fit" in ('SMALL', 'TRUE', 'LARGE'));