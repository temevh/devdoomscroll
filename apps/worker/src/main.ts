import { z } from "zod";
import {
  createDb,
  finishRun,
  isDue,
  latestPublishedAt,
  savePosts,
  startRun,
} from "./db.ts";
import { fetchNewPosts } from "./sources/devto.ts";
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

/** Scrapes DEV.to if it is due. Each attempt is one scrape_runs row. */
async function tick() {
  if (!force && !(await isDue(db))) return;

  const runId = await startRun(db);
  const startedAt = Date.now();
  let itemsFetched: number | undefined;
  try {
    const posts = await fetchNewPosts(await latestPublishedAt(db));
    itemsFetched = posts.length;
    const itemsNew = await savePosts(db, posts);
    await finishRun(db, runId, { status: "succeed", itemsFetched, itemsNew });
    log.info("scrape succeeded", {
      itemsFetched,
      itemsNew,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const error = describeError(err);
    await finishRun(db, runId, { status: "failed", itemsFetched, error });
    log.error("scrape failed", { error, ms: Date.now() - startedAt });
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
