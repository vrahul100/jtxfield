CREATE TABLE "rate_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"position_name" text NOT NULL,
	"hourly_rate" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;