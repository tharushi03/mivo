ALTER TABLE "orders" ADD COLUMN "delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recipient_name" varchar(255) NOT NULL;