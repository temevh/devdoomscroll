CREATE TABLE "public"."post_tags" (
  "post_id" uuid NOT NULL,
  "tag_id"  uuid NOT NULL,
  CONSTRAINT "post_tags_pkey" PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE "public"."post_tags"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."posts" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_id"    character varying        NOT NULL,
  "external_id"  character varying        NOT NULL,
  "title"        character varying        NOT NULL,
  "preview"      character varying(200),
  "url"          text                     NOT NULL,
  "image"        text,
  "published_at" timestamp with time zone NOT NULL,
  "ingested_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "posts_source_external_key" UNIQUE (source_id, external_id)
);

ALTER TABLE "public"."posts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scrape_runs" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_id"   character varying        NOT NULL,
  "started_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  CONSTRAINT "scrape_runs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."scrape_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sources" (
  "id"                      character varying NOT NULL,
  "name"                    character varying NOT NULL,
  "scrape_interval_minutes" integer           NOT NULL DEFAULT 180,
  "enabled"                 boolean           NOT NULL DEFAULT true,
  CONSTRAINT "sources_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sources"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tags" (
  "id"   uuid              NOT NULL DEFAULT gen_random_uuid(),
  "name" character varying NOT NULL,
  CONSTRAINT "tags_name_key" UNIQUE (name),
  CONSTRAINT "tags_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tags"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."status_enum" AS ENUM (
  'succeed',
  'running',
  'failed'
);

ALTER TABLE "public"."scrape_runs"
  ADD COLUMN "status" public.status_enum NOT NULL;

ALTER TABLE "public"."scrape_runs"
  ADD COLUMN "items_fetched" integer;

ALTER TABLE "public"."scrape_runs"
  ADD COLUMN "items_new" integer;

ALTER TABLE "public"."scrape_runs"
  ADD COLUMN "error" text;

ALTER TABLE "public"."post_tags"
  ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id);

ALTER TABLE "public"."scrape_runs"
  ADD CONSTRAINT "scrape_runs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id);

ALTER TABLE "public"."post_tags"
  ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

CREATE INDEX post_tags_tag_id_post_id_idx ON public.post_tags USING btree (tag_id, post_id);

CREATE INDEX posts_ingested_at_id_idx ON public.posts USING btree (ingested_at, id);

CREATE INDEX scrape_runs_source_id_started_at_idx ON public.scrape_runs USING btree (source_id, started_at);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."post_tags" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."post_tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."post_tags" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."post_tags" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."posts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."posts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."posts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."posts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrape_runs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."scrape_runs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrape_runs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrape_runs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sources" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sources" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sources" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sources" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tags" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."tags" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tags" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tags" TO "service_role";

