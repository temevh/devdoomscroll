-- Stack Overflow questions, scraped every 3 hours like dev.to.
INSERT INTO "public"."sources" ("id", "name", "scrape_interval_minutes", "enabled")
VALUES ('stackoverflow', 'Stack Overflow', 180, true)
ON CONFLICT ("id") DO NOTHING;
