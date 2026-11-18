import { CANONICAL, normalizeTags } from "../tags.ts";

/**
 * Canonical tags that are not searched for. `career` has no GitHub topic worth the request;
 * `opensource` describes every repository on GitHub.
 */
export const SKIPPED_TAGS: readonly string[] = ["career", "opensource"];

// Tags GitHub spells differently as a topic. Every other tag is also its own topic.
const TOPIC_SPELLING = new Map([
  ["go", "golang"],
  ["machinelearning", "machine-learning"],
  ["node", "nodejs"],
]);

/** One search per entry: repos with GitHub topic `topic` are filed under canonical `tag`. */
export const GITHUB_TOPICS: ReadonlyArray<{ tag: string; topic: string }> = CANONICAL.filter(
  (tag) => !SKIPPED_TAGS.includes(tag),
).map((tag) => ({ tag, topic: TOPIC_SPELLING.get(tag) ?? tag }));

// Which repos are worth a post. Fresh repos ranked by stars are full of repos that were
// given a pile of stars and every popular topic (hundreds of stars, almost no forks), so a
// repo needs forks too, and not suspiciously many of them. The numbers come from a look at
// the python, rust, docker, machine-learning and career topics on 2026-11-18: topic-stuffed
// repos sat near 0.01 forks per star, ordinary new repos at 0.05 to 0.4.
const WINDOW_DAYS = 7;
const MIN_STARS = 20;
const MIN_FORKS = 3;
const MIN_FORK_RATIO = 0.02;
const MAX_FORK_RATIO = 0.5;

/**
 * The repository search for one topic: repos created in the last 7 days (counted in UTC),
 * with at least 20 stars and 3 forks, leaving out forks and archived repos. `forks` is part
 * of the search, not only of isOrganic, so that star-farmed repos don't fill the single
 * page of results and push the real ones off it.
 */
export function searchQuery(topic: string, now: Date): string {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return `topic:${topic} created:>=${since} stars:>=${MIN_STARS} forks:>=${MIN_FORKS} fork:false archived:false`;
}

/** Whether the forks of a repo are a believable share (2% to 50%) of its stars. */
export function isOrganic(repo: { stargazers_count: number; forks_count: number }): boolean {
  if (repo.stargazers_count <= 0) return false;
  const ratio = repo.forks_count / repo.stargazers_count;
  return ratio >= MIN_FORK_RATIO && ratio <= MAX_FORK_RATIO;
}

/**
 * The canonical tags of a repo: those of its topics, then of its language, then `queryTag`
 * (the tag it was searched under) if that is not among them yet. The last step means a
 * repo found by a topic always has at least that tag.
 */
export function repoTags(
  repo: { topics: string[]; language?: string | null },
  queryTag: string,
): string[] {
  const tags = normalizeTags(repo.language ? [...repo.topics, repo.language] : repo.topics);
  return tags.includes(queryTag) ? tags : [...tags, queryTag];
}
