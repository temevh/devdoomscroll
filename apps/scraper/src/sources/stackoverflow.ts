import { setTimeout as sleep } from "node:timers/promises";
import { convert } from "html-to-text";
import { z } from "zod";
import { log } from "../logger.ts";
import type { Post } from "../../types.ts";
import { getJson } from "../utils/getJson.ts";
import { normalizeTags } from "../tags.ts";

const PER_PAGE = 100;
const MAX_PAGES = 5;
const MAX_ATTEMPTS = 5;

const HEADERS = {
  accept: "application/json",
  "user-agent":
    "devdoomscroll-worker (+https://github.com/temevh/devdoomscroll)",
};

export const postSchema = z.object({
  tags: z.array(z.string()),
  owner: z.object({
    account_id: z.number().int().optional(),
    reputation: z.number().int().optional(),
    user_id: z.number().int().optional(),
    user_type: z.string(),
    profile_image: z.url().optional(),
    display_name: z.string(),
    link: z.url().optional(),
  }),
  is_answered: z.boolean(),
  view_count: z.number().int(),
  closed_date: z.number().int().optional(), // only on closed questions
  answer_count: z.number().int(),
  score: z.number().int(),
  last_activity_date: z.number().int(),
  creation_date: z.number().int(),
  question_id: z.number().int(),
  link: z.url(),
  closed_reason: z.string().optional(), // only on closed questions
  title: z.string().min(1),
  body: z.string().optional(), // HTML, only with filter=withbody
});

// The API wraps every list in this envelope.
const pageSchema = z.object({
  items: z.array(postSchema),
  has_more: z.boolean(),
  quota_remaining: z.number().int(),
  backoff: z.number().int().optional(), // seconds to wait before the next call
});

export async function fetchStackoverflow(since: Date | null): Promise<Post[]> {
  const posts: Post[] = [];
  const params = new URLSearchParams({
    site: "stackoverflow",
    order: "desc",
    sort: "creation",
    filter: "withbody",
    pagesize: String(PER_PAGE),
  });
  if (since) params.set("fromdate", String(Math.floor(since.getTime() / 1000)));

  for (let page = 1; page <= MAX_PAGES; page++) {
    params.set("page", String(page));
    const res = pageSchema.parse(
      await getJson(
        `https://api.stackexchange.com/2.3/questions?${params}`,
        HEADERS,
        MAX_ATTEMPTS,
      ),
    );

    for (const p of res.items) {
      const publishedAt = new Date(p.creation_date * 1000);
      if (since && publishedAt < since) return posts;
      if (p.closed_date) continue; // closed questions are usually low quality
      const tags = normalizeTags(p.tags);
      if (tags.length === 0) continue;
      posts.push({
        externalId: String(p.question_id),
        title: toText(p.title), // title is HTML-entity encoded
        preview: toPreview(p.body ?? ""),
        url: p.link,
        image: null,
        publishedAt,
        tags,
      });
    }

    if (!res.has_more) break;
    if (page === MAX_PAGES)
      log.warn("stackoverflow: hit page limit, older posts skipped");
    if (res.quota_remaining < 10) {
      log.warn("stackoverflow: quota nearly used up, stopping", {
        quotaRemaining: res.quota_remaining,
      });
      break;
    }
    await sleep(Math.max(res.backoff ?? 0, 1) * 1_000);
  }

  return posts;
}

function toText(html: string): string {
  return convert(html, { wordwrap: false }).replace(/\s+/g, " ").trim();
}

function toPreview(html: string): string | null {
  const text = toText(html);
  if (!text) return null;
  return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
}
