-- Hacker News front page, scraped every 3 hours like the other sources.
INSERT INTO "public"."sources" ("id", "name", "scrape_interval_minutes", "enabled")
VALUES ('hackernews', 'Hacker News', 180, true)
ON CONFLICT ("id") DO NOTHING;
