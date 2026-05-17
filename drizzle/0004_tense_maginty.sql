CREATE TABLE "co_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"title" text NOT NULL,
	"gc_contact" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"cover_note" text,
	"markup" numeric(5, 2),
	"pdf_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "co_packets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "integration_interest" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text,
	"user_email" varchar(255),
	"integration_name" varchar(100),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "integration_interest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_timesheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"week_start_date" timestamp NOT NULL,
	"total_hours" numeric(10, 2) DEFAULT '0',
	"billable_hours" numeric(10, 2) DEFAULT '0',
	"non_scope_hours" numeric(10, 2) DEFAULT '0',
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "type" varchar(30) DEFAULT 'regular';--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "extracted_data" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "wa_sent_timestamp" timestamp;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "wa_received_timestamp" timestamp;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "potential_change" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "flag_category" varchar(50);--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "buckets" ADD COLUMN "flag_resolution" varchar(50);--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "company_code" varchar(10);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "radius" integer;--> statement-breakpoint
ALTER TABLE "txns" ADD COLUMN "time" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "txns" ADD COLUMN "labor" text;--> statement-breakpoint
ALTER TABLE "txns" ADD COLUMN "material" text;--> statement-breakpoint
ALTER TABLE "txns" ADD COLUMN "potential_change" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "co_packets" ADD CONSTRAINT "co_packets_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ADD CONSTRAINT "weekly_timesheets_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ADD CONSTRAINT "weekly_timesheets_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timesheets" ADD CONSTRAINT "weekly_timesheets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_company_code_unique" UNIQUE("company_code");--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "co_packets" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "integration_interest" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "weekly_timesheets" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);