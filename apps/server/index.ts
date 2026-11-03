import fastify from "fastify";
import { Kysely, PostgresDialect, type Generated } from "kysely";
import { z } from "zod";
import pg from "pg";
import { type Database } from "./types.ts";

const server = fastify();

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

server.get("/posts", async () => {
  return db
    .selectFrom("posts")
    .selectAll()
    .orderBy("published_at", "desc")
    .limit(50)
    .execute();
});

server.get("/tags", async () => {
  const rows = await db.selectFrom("tags").select("name").orderBy("name").execute();
  return rows.map((r) => r.name);
});

server.listen({ port: 8080 }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at http://localhost:8080`);
});
