import { setTimeout as sleep } from "node:timers/promises";
import { convert } from "html-to-text";
import { z } from "zod";
import { log } from "../logger.ts";
import type { Post } from "../../types.ts";
import { getJson } from "../utils/getJson.ts";

const PER_PAGE = 100;
// Upper bound for one run, so a first run or a long outage can't page forever.
const MAX_PAGES = 5;
const MAX_ATTEMPTS = 5;
const HEADERS = {
  accept: "application/vnd.forem.api-v1+json",
  // DEV.to rejects requests without a User-Agent.
  "user-agent":
    "devdoomscroll-worker (+https://github.com/temevh/devdoomscroll)",
};

const articlesSchema = z.array(
  z.object({
    id: z.number().int(),
    title: z.string().min(1),
    description: z.string().nullish(),
    url: z.url(),
    cover_image: z.string().nullish(),
    social_image: z.string().nullish(),
    published_at: z.iso.datetime({ offset: true }),
    tag_list: z.array(z.string()),
    language: z.string().nullable(),
  }),
);

export async function fetchNewPosts(since: Date | null): Promise<Post[]> {
  const posts: Post[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const articles = articlesSchema.parse(
      await getJson(
        `https://dev.to/api/articles/latest?per_page=${PER_PAGE}&page=${page}`,
        HEADERS,
        MAX_ATTEMPTS,
      ),
    );

    for (const a of articles) {
      const publishedAt = new Date(a.published_at);
      // >= keeps posts sharing the cursor's timestamp; the unique key drops the one we have.
      if (since && publishedAt < since) return posts;
      // Only English posts. Checked after the cursor so paging still stops on time.
      if (a.language !== "en") continue;
      posts.push({
        externalId: String(a.id),
        title: a.title.trim(),
        preview: toPreview(a.description ?? ""),
        url: a.url,
        image: a.cover_image || a.social_image || null,
        publishedAt,
        tags: [
          ...new Set(
            a.tag_list.map((t) => t.trim().toLowerCase()).filter(Boolean),
          ),
        ],
      });
    }

    if (articles.length < PER_PAGE) break;
    if (page === MAX_PAGES)
      log.warn("devto: hit page limit, older posts skipped");
    await sleep(1_000); // be polite between pages
  }

  return posts;
}

/** Plain text for posts.preview (varchar(200)). */
function toPreview(html: string): string | null {
  const text = convert(html, { wordwrap: false }).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
}
