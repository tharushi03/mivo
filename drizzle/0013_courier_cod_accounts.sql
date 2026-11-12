ALTER TABLE "couriers" ADD COLUMN "supports_cod" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "account_number" varchar(60);--> statement-breakpoint
ALTER TABLE "couriers" ADD COLUMN "booking_instructions" text;