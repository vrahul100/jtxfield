-- Rename tables: companies -> nodes, users -> members, change_orders -> txns
ALTER TABLE "companies" RENAME TO "nodes";
ALTER TABLE "users" RENAME TO "members";
ALTER TABLE "change_orders" RENAME TO "txns";

-- Update foreign key constraint names (optional but keeps things clean)
ALTER TABLE "txns" DROP CONSTRAINT IF EXISTS "change_orders_company_id_companies_id_fk";
ALTER TABLE "txns" DROP CONSTRAINT IF EXISTS "change_orders_user_id_users_id_fk";
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "users_company_id_companies_id_fk";

ALTER TABLE "txns" ADD CONSTRAINT "txns_company_id_nodes_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "txns" ADD CONSTRAINT "txns_user_id_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "members" ADD CONSTRAINT "members_company_id_nodes_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;

-- Rename unique constraint
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "users_phone_number_unique";
ALTER TABLE "members" ADD CONSTRAINT "members_phone_number_unique" UNIQUE("phone_number");
