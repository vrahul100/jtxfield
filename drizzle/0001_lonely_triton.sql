CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(10) NOT NULL,
	"node_id" integer,
	"full_name" varchar(100),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_invited_by_members_id_fk";
--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN IF NOT EXISTS "suspected_project_name" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "pending_node_id" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "aliases" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "is_inbox" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_node_id_nodes_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_pending_node_id_nodes_id_fk') THEN
    ALTER TABLE "members" ADD CONSTRAINT "members_pending_node_id_nodes_id_fk" FOREIGN KEY ("pending_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;