CREATE TABLE "product_pairings" (
	"product_id" uuid NOT NULL,
	"paired_product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_pairings_product_id_paired_product_id_pk" PRIMARY KEY("product_id","paired_product_id"),
	CONSTRAINT "product_pairings_not_self" CHECK ("product_pairings"."product_id" <> "product_pairings"."paired_product_id")
);
--> statement-breakpoint
ALTER TABLE "product_pairings" ADD CONSTRAINT "product_pairings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pairings" ADD CONSTRAINT "product_pairings_paired_product_id_products_id_fk" FOREIGN KEY ("paired_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;