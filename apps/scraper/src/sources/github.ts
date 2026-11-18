import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { log } from "../logger.ts";
import type { Post } from "../../types.ts";
import { getJson } from "../utils/getJson.ts";
import { GITHUB_TOPICS, isOrganic, repoTags, searchQuery } from "../utils/github.ts";
import { toPreview } from "../utils/text.ts";

const SEARCH = "https://api.github.com/search/repositories";
const PER_PAGE = 30; // the busiest topics have more matches, but the top 30 by stars is enough
const ATTEMPTS = 3;
// The search API allows 10 requests a minute without a token and 30 with one. getJson does
// not expose the rate-limit headers, so the pace is fixed, with a little room to spare.
const SPACING_MS = 6_500;
const SPACING_WITH_TOKEN_MS = 2_200;

const HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "devdoomscroll-worker (+https://github.com/temevh/devdoomscroll)",
};

const searchSchema = z.object({
  incomplete_results: z.boolean(),
  items: z.array(
    z.object({
      id: z.number().int(),
      full_name: z.string(),
      description: z.string().nullish(),
      html_url: z.string(),
      created_at: z.iso.datetime(),
      stargazers_count: z.number().int(),
      forks_count: z.number().int(),
      language: z.string().nullish(),
      topics: z.array(z.string()).default([]),
    }),
  ),
});

// Descriptions are plain text, while toPreview reads HTML: escape so "<T>" survives.
const plainPreview = (text: string) =>
  toPreview(text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));

/**
 * New, popular GitHub repositories for every tag in GITHUB_TOPICS: one search per topic,
 * the top 30 by stars among repos created in the last 7 days (see searchQuery), so that a
 * visitor following a tag finds the repos for it in the feed.
 *
 * Like fetchHackernews this takes no `since`: the window is fixed and ranked by stars, so a
 * repo can be found days after it was created, and the database skips the ones it has
 * (unique on source + external id).
 *
 * Searches run one after another with a pause between them (see SPACING_MS), so a run takes
 * about 4 minutes, or 100 seconds with a token. A failing search is logged and the others
 * still count; every one failing fails the scrape, since that means the API is down, the
 * rate limit was hit, or its format changed. A repo found under several topics is one post
 * carrying the tags of all of them. Repos that look star-farmed are left out (isOrganic).
 *
 * `token` is an optional GitHub token that raises the rate limit; `now` is for tests.
 */
export async function fetchGithub(
  opts: { token?: string | undefined; now?: Date } = {},
): Promise<Post[]> {
  const now = opts.now ?? new Date();
  const headers: Record<string, string> = { ...HEADERS };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const spacingMs = opts.token ? SPACING_WITH_TOKEN_MS : SPACING_MS;

  const posts = new Map<number, Post>();
  const failures: unknown[] = [];

  for (const [i, { tag, topic }] of GITHUB_TOPICS.entries()) {
    if (i > 0) await sleep(spacingMs);

    const query = new URLSearchParams({
      q: searchQuery(topic, now),
      sort: "stars",
      order: "desc",
      per_page: String(PER_PAGE),
    });
    let result: z.infer<typeof searchSchema>;
    try {
      result = searchSchema.parse(await getJson(`${SEARCH}?${query}`, headers, ATTEMPTS));
    } catch (err) {
      failures.push(err);
      continue;
    }
    if (result.incomplete_results) {
      log.warn(`github: GitHub reports incomplete results for topic ${topic}`);
    }

    for (const repo of result.items) {
      if (!isOrganic(repo)) continue;
      const tags = repoTags(repo, tag);
      const known = posts.get(repo.id);
      if (known) {
        known.tags = [...new Set([...known.tags, ...tags])];
        continue;
      }
      posts.set(repo.id, {
        externalId: String(repo.id),
        title: repo.full_name,
        preview: plainPreview(repo.description ?? ""),
        url: repo.html_url,
        // GitHub's social-preview card: name, description, stars and language of the repo.
        image: `https://opengraph.githubassets.com/1/${repo.full_name}`,
        publishedAt: new Date(repo.created_at),
        tags,
      });
    }
  }

  if (failures.length === GITHUB_TOPICS.length) {
    throw new Error(
      `github: all ${failures.length} searches failed (first error: ${String(failures[0])})`,
    );
  }
  if (failures.length > 0) {
    log.warn(`github: ${failures.length} of ${GITHUB_TOPICS.length} searches failed`, {
      firstError: String(failures[0]),
    });
  }
  return [...posts.values()];
}
