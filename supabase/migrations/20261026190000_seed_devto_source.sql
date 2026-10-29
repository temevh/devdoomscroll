-- The worker only scrapes sources that have a row here and an adapter in
-- apps/worker/src/sources. 180 minutes = the 3 hour refresh from docs/plan.md.
INSERT INTO "public"."sources" ("id", "name", "scrape_interval_minutes", "enabled")
VALUES ('devto', 'DEV Community', 180, true)
ON CONFLICT ("id") DO NOTHING;
