import { z } from "zod";
import {
  createDb,
  finishRun,
  isDue,
  latestPublishedAt,
  savePosts,
  startRun,
} from "./db.ts";
import { fetchDevto, fetchStackoverflow } from "./sources/index.ts";
import type { Post } from "../types.ts";
import { describeError, log } from "./logger.ts";

const env = z
  .object({
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error:
        "must be a postgresql:// connection string (Supabase: Connect > Session pooler)",
    }),
    TICK_SECONDS: z.coerce.number().int().positive().default(60),
  })
  .parse(process.env);

// --once: check the schedule a single time, scrape if due, then exit.
// --force: scrape even if the schedule says it isn't due yet.
const once = process.argv.includes("--once");
const force = process.argv.includes("--force");
const db = createDb(env.DATABASE_URL);

const SOURCES: Record<string, (since: Date | null) => Promise<Post[]>> = {
  devto: fetchDevto,
  stackoverflow: fetchStackoverflow,
};

async function tick() {
  for (const [sourceId, fetchPosts] of Object.entries(SOURCES)) {
    if (stopping) return;
    if (!force && !(await isDue(db, sourceId))) continue;
    await scrape(sourceId, fetchPosts);
  }
}

async function scrape(
  sourceId: string,
  fetchPosts: (since: Date | null) => Promise<Post[]>,
) {
  const runId = await startRun(db, sourceId);
  const startedAt = Date.now();
  let itemsFetched: number | undefined;
  try {
    const posts = await fetchPosts(await latestPublishedAt(db, sourceId));
    itemsFetched = posts.length;
    const itemsNew = await savePosts(db, sourceId, posts);
    await finishRun(db, runId, { status: "succeed", itemsFetched, itemsNew });
    log.info("scrape succeeded", {
      source: sourceId,
      itemsFetched,
      itemsNew,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const error = describeError(err);
    await finishRun(db, runId, { status: "failed", itemsFetched, error });
    log.error("scrape failed", {
      source: sourceId,
      error,
      ms: Date.now() - startedAt,
    });
    if (once) process.exitCode = 1;
  }
}

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function loop() {
  timer = undefined;
  try {
    await tick();
  } catch (err) {
    // e.g. the database is unreachable; try again next tick.
    log.error("tick failed", { error: describeError(err) });
    if (once) process.exitCode = 1;
  }
  if (once || stopping) return db.destroy();
  timer = setTimeout(loop, env.TICK_SECONDS * 1_000);
}

// On SIGTERM/SIGINT, exit now if idle, or right after the current scrape.
function stop(signal: string) {
  log.info("shutting down", { signal });
  stopping = true;
  if (timer) {
    clearTimeout(timer);
    void db.destroy();
  }
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

log.info("worker started", { once, force, tickSeconds: env.TICK_SECONDS });
void loop();
