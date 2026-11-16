import { z } from "zod";
import type { Post } from "../../types.ts";
import { inferTags } from "../tags.ts";
import { getJson } from "../utils/getJson.ts";
import { toPreview } from "../utils/text.ts";

const FRONT_PAGE_URL =
  "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=100";
const MAX_ATTEMPTS = 5;

const HEADERS = {
  accept: "application/json",
  "user-agent":
    "devdoomscroll-worker (+https://github.com/temevh/devdoomscroll)",
};

const responseSchema = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      title: z.string().min(1),
      url: z.string().nullish(), // absent for Ask HN and other text posts
      story_text: z.string().nullish(), // HTML-escaped text of Ask/Show HN posts
      created_at_i: z.number().int(), // epoch seconds
    }),
  ),
});

/**
 * The stories currently on the Hacker News front page.
 *
 * Unlike the other adapters this takes no `since`. The front page ranks by
 * popularity, so a story can arrive days after it was posted; skipping everything
 * older than the newest stored post would lose exactly those. Stories we already
 * have are skipped by the database (unique on source + external id).
 *
 * HN stories carry no topic tags, so tags are inferred from the title where
 * possible. Unlike the other sources, stories we can't tag are kept (with no tags):
 * HN yields few enough stories that filtering isn't needed. They only show up in
 * the unfiltered feed, since the API's tag filter matches tagged posts only.
 */
export async function fetchHackernews(): Promise<Post[]> {
  const { hits } = responseSchema.parse(
    await getJson(FRONT_PAGE_URL, HEADERS, MAX_ATTEMPTS),
  );

  const posts: Post[] = [];
  for (const hit of hits) {
    const title = hit.title.trim();
    posts.push({
      externalId: hit.objectID,
      title,
      preview: toPreview(hit.story_text ?? ""),
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      image: null,
      publishedAt: new Date(hit.created_at_i * 1000),
      tags: inferTags(title),
    });
  }
  return posts;
}
