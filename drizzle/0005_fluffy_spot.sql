ALTER TABLE "buckets" ADD COLUMN "co_packet_id" integer;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "extraction_json" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "conversation_history" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "clarity_score" integer;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "last_question_type" varchar(50);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "conversation_state" varchar(50);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "state_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "pending_correction" text;--> statement-breakpoint
ALTER TABLE "txns" ADD COLUMN "location" text;