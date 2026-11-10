import fastify, { type FastifyReply } from "fastify";
import { Kysely, PostgresDialect, sql } from "kysely";
import { z } from "zod";
import pg from "pg";
import { type Database } from "./types.ts";

const server = fastify();
const port = Number(process.env.PORT ?? 8080);
fastify({ logger: true });

const env = z
  .object({
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error:
        "must be a postgresql:// connection string (Supabase: Connect > Session pooler)",
    }),
  })
  .parse(process.env);

type Db = Kysely<Database>;

const createDb = (connectionString: string): Db =>
  new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 2 }),
    }),
  });

const db = createDb(env.DATABASE_URL);

server.get("/ping", async () => {
  return "pong\n";
});

const listPostsQuery = z.object({
  tags: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Cursor = base64url("<published_at ISO>|<post id>"), keyset on (published_at, id) desc.
const encodeCursor = (publishedAt: Date, id: string) =>
  Buffer.from(`${publishedAt.toISOString()}|${id}`).toString("base64url");

const decodeCursor = (cursor: string) => {
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(iso ?? "");
  if (!id || Number.isNaN(date.getTime())) return null;
  return { publishedAt: date, id };
};

const badRequest = (reply: FastifyReply, instance: string, detail: string) =>
  reply.code(400).type("application/problem+json").send({
    type: "https://doom.dev/problems/invalid-parameter",
    title: "Invalid query parameter",
    status: 400,
    detail,
    instance,
  });

server.get("/posts", async (request, reply) => {
  const parsed = listPostsQuery.safeParse(request.query);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return badRequest(
      reply,
      request.url,
      `${issue?.path.join(".")}: ${issue?.message}`,
    );
  }
  const { tags, limit, cursor } = parsed.data;

  const after = cursor ? decodeCursor(cursor) : undefined;
  if (after === null)
    return badRequest(reply, request.url, "cursor is invalid");

  let query = db
    .selectFrom("posts as p")
    .innerJoin("sources as s", "s.id", "p.source_id")
    .select([
      "p.id",
      "p.title",
      "p.preview",
      "p.url",
      "p.image",
      "p.published_at",
      "s.id as source_id",
      "s.name as source_name",
      sql<string[]>`coalesce((
        select array_agg(t.name order by t.name)
        from post_tags pt join tags t on t.id = pt.tag_id
        where pt.post_id = p.id
      ), '{}')`.as("tags"),
    ])
    .orderBy("p.published_at", "desc")
    .orderBy("p.id", "desc")
    .limit(limit + 1);

  if (tags.length > 0) {
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("post_tags as pt")
          .innerJoin("tags as t", "t.id", "pt.tag_id")
          .whereRef("pt.post_id", "=", "p.id")
          .where("t.name", "in", tags)
          .select(sql`1`.as("one")),
      ),
    );
  }

  if (after) {
    query = query.where(
      sql<boolean>`(p.published_at, p.id) < (${after.publishedAt}, ${after.id}::uuid)`,
    );
  }

  const rows = await query.execute();
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: page.map((r) => ({
      id: r.id,
      title: r.title,
      preview: r.preview,
      url: r.url,
      publishedAt: r.published_at.toISOString(),
      image: r.image,
      tags: r.tags,
      source: { id: r.source_id, name: r.source_name },
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.published_at, last.id)
        : null,
  };
});

server.get("/tags", async () => {
  const rows = await db
    .selectFrom("tags")
    .select("name")
    .orderBy("name")
    .execute();
  return rows.map((r) => r.name);
});

server.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at http://localhost:8080`);
});
