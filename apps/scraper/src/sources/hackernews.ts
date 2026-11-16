import { z } from "zod";
import { log } from "../logger.ts";
import type { Post } from "../../types.ts";
import { NOT_TAGGED, inferTags } from "../tags.ts";
import { mapSettled } from "../utils/concurrency.ts";
import { getJson } from "../utils/getJson.ts";
import { toPreview } from "../utils/text.ts";

const API = "https://hacker-news.firebaseio.com/v0";
const PAGE_SIZE = 30; // stories per page on news.ycombinator.com
const PAGES = 10; // ranks 1-300 (the API lists 500, 17 pages)
const CONCURRENCY = 10;
const RANKED_ATTEMPTS = 5;
const STORY_ATTEMPTS = 3;

const HEADERS = {
  accept: "application/json",
  "user-agent":
    "devdoomscroll-worker (+https://github.com/temevh/devdoomscroll)",
};

const rankedSchema = z.array(z.number().int());

// The API answers `null` for an id it does not have, and drops the title of deleted items.
const storySchema = z
  .object({
    id: z.number().int(),
    type: z.string(),
    title: z.string().optional(),
    url: z.string().nullish(), // absent for Ask HN and other text posts
    text: z.string().nullish(), // HTML of Ask/Show HN posts
    time: z.number().int(), // epoch seconds
    deleted: z.boolean().nullish(),
    dead: z.boolean().nullish(),
  })
  .nullable();

/**
 * The first 10 pages of Hacker News's own ranking (the 300 top stories), the same
 * stories as the site's "More" pages.
 *
 * Unlike the other adapters this takes no `since`. The ranking mixes stories of many
 * ages (rank 300 is typically days old), so skipping everything older than the newest
 * stored post would lose exactly those. Stories we already have are skipped by the
 * database (unique on source + external id).
 *
 * Stories are fetched one request each, 10 at a time. Some failing is tolerated (they
 * are still ranked on the next run); every one failing is not, since that means the API
 * is down or its format changed.
 *
 * HN stories carry no topic tags, so tags are inferred from the title where possible.
 * Stories no tag fits are not dropped (unlike posts without a known tag from other
 * sources) but filed under NOT_TAGGED, so every story has a tag and can be found by
 * following it.
 */
export async function fetchHackernews(): Promise<Post[]> {
  const ranked = rankedSchema
    .parse(await getJson(`${API}/topstories.json`, HEADERS, RANKED_ATTEMPTS))
    .slice(0, PAGE_SIZE * PAGES);

  const results = await mapSettled(ranked, CONCURRENCY, async (id) =>
    storySchema.parse(await getJson(`${API}/item/${id}.json`, HEADERS, STORY_ATTEMPTS)),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length === ranked.length && ranked.length > 0) {
    throw new Error(
      `hackernews: all ${ranked.length} story fetches failed (first error: ${String(failures[0]?.reason)})`,
    );
  }
  if (failures.length > 0) {
    log.warn(`hackernews: ${failures.length} of ${ranked.length} story fetches failed`, {
      firstError: String(failures[0]?.reason),
    });
  }

  const posts: Post[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const story = result.value;
    if (!story || story.deleted || story.dead || story.type !== "story" || !story.title) continue;
    const title = story.title.trim();
    const tags = inferTags(title);
    posts.push({
      externalId: String(story.id),
      title,
      preview: toPreview(story.text ?? ""),
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      image: null,
      publishedAt: new Date(story.time * 1000),
      tags: tags.length > 0 ? tags : [NOT_TAGGED],
    });
  }
  return posts;
}
