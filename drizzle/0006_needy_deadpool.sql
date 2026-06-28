ALTER TABLE "buckets" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "address" text;