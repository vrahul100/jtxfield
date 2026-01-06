ALTER TABLE "buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holding_tank" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "txns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "buckets" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "holding_tank" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "members" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "nodes" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "projects" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "rate_cards" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "txns" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Enable full access for service_role" ON "users" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);