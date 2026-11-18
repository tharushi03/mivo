ALTER TABLE "seller_profiles" ALTER COLUMN "commission_rate" SET DEFAULT '5.00';--> statement-breakpoint
-- Boutiques still on the old 10% default move to 5%. Custom rates stay. Past order items keep the rate they were sold at.
UPDATE "seller_profiles" SET "commission_rate" = 5.00 WHERE "commission_rate" = 10.00;
