-- Show "dev.to" instead of "DEV Community" on post cards.
UPDATE "public"."sources" SET "name" = 'dev.to' WHERE "id" = 'devto';
