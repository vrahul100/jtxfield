-- Add new columns to existing tables and create new tables
-- This migration assumes tables have already been renamed: companies→nodes, users→members, change_orders→txns

-- 1. Add domain column to members (if not exists)
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "domain" varchar(50) DEFAULT 'construction';

-- 2. Create projects table
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);

-- 3. Create buckets table
CREATE TABLE IF NOT EXISTS "buckets" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"source" varchar(20) NOT NULL,
	"from_phone" varchar(20) NOT NULL,
	"raw_text" text,
	"image_url" text,
	"audio_url" text,
	"domain" varchar(50),
	"intent" varchar(50),
	"project_id" integer,
	"project_name_raw" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"ai_response" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- 4. Add new columns to txns
ALTER TABLE "txns" ADD COLUMN IF NOT EXISTS "bucket_id" integer;
ALTER TABLE "txns" ADD COLUMN IF NOT EXISTS "project_id" integer;

-- 5. Add foreign keys for projects table
ALTER TABLE "projects" ADD CONSTRAINT "projects_node_id_nodes_id_fk" 
    FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;

-- 6. Add foreign keys for buckets table
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_member_id_members_id_fk" 
    FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_node_id_nodes_id_fk" 
    FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_project_id_projects_id_fk" 
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;

-- 7. Add foreign keys for txns new columns
ALTER TABLE "txns" ADD CONSTRAINT "txns_bucket_id_buckets_id_fk" 
    FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "txns" ADD CONSTRAINT "txns_project_id_projects_id_fk" 
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
