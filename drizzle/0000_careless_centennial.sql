CREATE TABLE "buckets" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"project_id" integer,
	"source" varchar(20) NOT NULL,
	"from_phone" varchar(20) NOT NULL,
	"raw_text" text,
	"image_urls" text,
	"audio_urls" text,
	"transcripts" text,
	"domain" varchar(50),
	"intent" varchar(50),
	"project_name_raw" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"validation_errors" text,
	"validation_attempts" integer DEFAULT 0,
	"ai_response" text,
	"message_sids" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "holding_tank" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_phone" varchar(20) NOT NULL,
	"source" varchar(20) NOT NULL,
	"raw_text" text,
	"image_urls" text,
	"audio_urls" text,
	"message_sid" varchar(50),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"phone_number" varchar(20) NOT NULL,
	"full_name" varchar(100),
	"language_preference" varchar(10) DEFAULT 'en',
	"domain" varchar(50),
	"status" varchar(20) DEFAULT 'pending',
	"onboarded_at" timestamp,
	"invited_by" integer,
	"last_confirmed_project_id" integer,
	"project_confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "members_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_hourly_rate" numeric(10, 2) DEFAULT '85.00',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"position_name" text NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "txns" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_id" integer,
	"company_id" integer,
	"user_id" integer,
	"project_id" integer,
	"job" text,
	"evidence" text,
	"scope_description" text,
	"estimated_revenue" numeric(10, 2),
	"status" varchar(20) DEFAULT 'PROCESSING',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_company_id_nodes_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_invited_by_members_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_last_confirmed_project_id_projects_id_fk" FOREIGN KEY ("last_confirmed_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_company_id_nodes_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txns" ADD CONSTRAINT "txns_bucket_id_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txns" ADD CONSTRAINT "txns_company_id_nodes_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txns" ADD CONSTRAINT "txns_user_id_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txns" ADD CONSTRAINT "txns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;