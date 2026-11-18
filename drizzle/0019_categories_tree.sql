DROP INDEX "products_category_idx";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "department" varchar(20) DEFAULT 'women' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subcategory" varchar(60);--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("department","category","subcategory");--> statement-breakpoint
-- Move existing products from the old flat list ("Dresses", "Sarees", ...) to the new tree.
UPDATE "products" SET "subcategory" = CASE "category" WHEN 'Sarees' THEN 'sarees' WHEN 'Batik' THEN 'batik' WHEN 'Kurtha & Ethnic' THEN 'kurti' END,
  "category" = CASE "category"
    WHEN 'Dresses' THEN 'dresses' WHEN 'Tops' THEN 'tops' WHEN 'Bottoms' THEN 'bottoms'
    WHEN 'Sarees' THEN 'ethnic' WHEN 'Batik' THEN 'ethnic' WHEN 'Kurtha & Ethnic' THEN 'ethnic'
    WHEN 'Activewear' THEN 'activewear' WHEN 'Accessories' THEN 'accessories'
    ELSE NULL END;
