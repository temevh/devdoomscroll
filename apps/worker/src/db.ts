import { Kysely, PostgresDialect, sql, type Generated } from "kysely";
import pg from "pg";
import type { Post } from "../types.ts";

export const SOURCE_ID = "devto";

interface Database {
  sources: { id: string; scrape_interval_minutes: number; enabled: boolean };
  scrape_runs: {
    id: Generated<string>;
    source_id: string;
    started_at: Generated<Date>;
    finished_at: Date | null;
    status: "succeed" | "running" | "failed";
    items_fetched: number | null;
    items_new: number | null;
    error: string | null;
  };
  posts: {
    id: Generated<string>;
    source_id: string;
    external_id: string;
    title: string;
    preview: string | null;
    url: string;
    image: string | null;
    published_at: Date;
  };
  tags: { id: Generated<string>; name: string };
  post_tags: { post_id: string; tag_id: string };
}

export type Db = Kysely<Database>;

export const createDb = (connectionString: string): Db =>
  new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 2 }),
    }),
  });

/**
 * Due when the source is enabled and its last run started at least
 * scrape_interval_minutes ago (or it never ran). The schedule lives in the
 * database, so restarts don't lose it.
 */
export async function isDue(db: Db): Promise<boolean> {
  const row = await db
    .selectFrom("sources as s")
    .leftJoin("scrape_runs as r", "r.source_id", "s.id")
    .select([
      "s.scrape_interval_minutes",
      (eb) => eb.fn.max("r.started_at").as("last"),
    ])
    .where("s.id", "=", SOURCE_ID)
    .where("s.enabled", "=", true)
    .groupBy("s.id")
    .executeTakeFirst();
  if (!row) return false;
  return (
    !row.last ||
    Date.now() - row.last.getTime() >= row.scrape_interval_minutes * 60_000
  );
}

export async function latestPublishedAt(db: Db): Promise<Date | null> {
  const row = await db
    .selectFrom("posts")
    .select((eb) => eb.fn.max("published_at").as("latest"))
    .where("source_id", "=", SOURCE_ID)
    .executeTakeFirst();
  return row?.latest ?? null;
}

export async function startRun(db: Db): Promise<string> {
  const row = await db
    .insertInto("scrape_runs")
    .values({ source_id: SOURCE_ID, status: "running" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function finishRun(
  db: Db,
  id: string,
  result: {
    status: "succeed" | "failed";
    itemsFetched?: number;
    itemsNew?: number;
    error?: string;
  },
): Promise<void> {
  await db
    .updateTable("scrape_runs")
    .set({
      status: result.status,
      finished_at: sql<Date>`now()`,
      items_fetched: result.itemsFetched ?? null,
      items_new: result.itemsNew ?? null,
      error: result.error ?? null,
    })
    .where("id", "=", id)
    .execute();
}

export async function savePosts(db: Db, posts: Post[]): Promise<number> {
  if (posts.length === 0) return 0;

  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto("posts")
      .values(
        posts.map((p) => ({
          source_id: SOURCE_ID,
          external_id: p.externalId,
          title: p.title,
          preview: p.preview,
          url: p.url,
          image: p.image,
          published_at: p.publishedAt,
        })),
      )
      .onConflict((oc) => oc.columns(["source_id", "external_id"]).doNothing())
      .returning("id")
      .execute();

    const tagNames = [...new Set(posts.flatMap((p) => p.tags))];
    if (tagNames.length === 0) return inserted.length;

    await trx
      .insertInto("tags")
      .values(tagNames.map((name) => ({ name })))
      .onConflict((oc) => oc.column("name").doNothing())
      .execute();

    const [postRows, tagRows] = await Promise.all([
      trx
        .selectFrom("posts")
        .select(["id", "external_id"])
        .where("source_id", "=", SOURCE_ID)
        .where(
          "external_id",
          "in",
          posts.map((p) => p.externalId),
        )
        .execute(),
      trx
        .selectFrom("tags")
        .select(["id", "name"])
        .where("name", "in", tagNames)
        .execute(),
    ]);
    const postIds = new Map(postRows.map((r) => [r.external_id, r.id]));
    const tagIds = new Map(tagRows.map((r) => [r.name, r.id]));

    await trx
      .insertInto("post_tags")
      .values(
        posts.flatMap((p) =>
          p.tags.map((tag) => ({
            post_id: postIds.get(p.externalId)!,
            tag_id: tagIds.get(tag)!,
          })),
        ),
      )
      .onConflict((oc) => oc.columns(["post_id", "tag_id"]).doNothing())
      .execute();

    return inserted.length;
  });
}
