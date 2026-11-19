import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  driveTimers,
  json,
  mockFetchBy,
  restoreAll,
  settle,
  silenceLogs,
  useFakeTimers,
} from "../testing.ts";
import { GITHUB_TOPICS, searchQuery } from "../utils/github.ts";
import { fetchGithub } from "./github.ts";

const SEARCH_URL = "https://api.github.com/search/repositories";
const NOW = new Date("2026-11-18T10:00:00Z");
const TOPIC_COUNT = GITHUB_TOPICS.length;

// A search hit as the API returns it, with some of the fields the adapter does not use.
const repo = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `repo-${id}`,
  full_name: `ann/repo-${id}`,
  private: false,
  owner: { login: "ann", id: 9, type: "User" },
  html_url: `https://github.com/ann/repo-${id}`,
  description: "A tool",
  fork: false,
  created_at: "2026-11-15T09:30:00Z",
  stargazers_count: 100,
  forks_count: 8, // 0.08 of the stars: a normal share
  language: "Rust",
  topics: ["rust"],
  ...over,
});

const topicOf = (url: URL) => /topic:(\S+)/.exec(url.searchParams.get("q") ?? "")?.[1];

/**
 * A fake GitHub search API. `hits` lists the repos each topic returns (none for a topic not
 * mentioned); `status` makes a topic answer with that HTTP status instead.
 */
function fakeGithub(
  hits: Record<string, unknown[]> = {},
  status: Record<string, number> = {},
  incomplete = false,
) {
  return (url: URL) => {
    const topic = topicOf(url) ?? "";
    const code = status[topic];
    if (code) return new Response("", { status: code });
    const items = hits[topic] ?? [];
    return json({ total_count: items.length, incomplete_results: incomplete, items });
  };
}

const run = (opts: { token?: string } = {}) =>
  driveTimers(fetchGithub({ now: NOW, ...opts }), 10_000);

/** Lets the response of the request in flight be read before the clock is moved. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await settle();
};

describe("fetchGithub", () => {
  let logs: ReturnType<typeof silenceLogs>;

  beforeEach(() => {
    useFakeTimers();
    logs = silenceLogs();
  });
  afterEach(restoreAll);

  it("maps a repository to a post", async () => {
    mockFetchBy(fakeGithub({ rust: [repo(42, { description: "A fast tool" })] }));

    assert.deepEqual(await run(), [
      {
        externalId: "42",
        title: "ann/repo-42",
        preview: "A fast tool",
        url: "https://github.com/ann/repo-42",
        image: "https://opengraph.githubassets.com/1/ann/repo-42",
        publishedAt: new Date("2026-11-15T09:30:00Z"),
        tags: ["rust"],
      },
    ]);
  });

  it("searches once per topic, newest window first by stars, 30 per page", async () => {
    const fetch = mockFetchBy(fakeGithub());

    await run();

    assert.equal(fetch.requests.length, TOPIC_COUNT);
    assert.deepEqual(
      fetch.requests.map((r) => topicOf(r.url)),
      GITHUB_TOPICS.map((t) => t.topic),
    );
    const [first] = fetch.requests;
    assert.equal(first?.url.href.split("?")[0], SEARCH_URL);
    assert.equal(first?.url.searchParams.get("q"), searchQuery(GITHUB_TOPICS[0]!.topic, NOW));
    assert.equal(first?.url.searchParams.get("sort"), "stars");
    assert.equal(first?.url.searchParams.get("order"), "desc");
    assert.equal(first?.url.searchParams.get("per_page"), "30");
  });

  it("uses the last 7 days up to now when no date is given", async () => {
    const fetch = mockFetchBy(fakeGithub());

    await driveTimers(fetchGithub(), 10_000);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    assert.match(fetch.requests[0]?.url.searchParams.get("q") ?? "", new RegExp(`created:>=${sevenDaysAgo} `));
  });

  it("sends the GitHub API headers, and no authorization without a token", async () => {
    const fetch = mockFetchBy(fakeGithub());

    await run();

    const headers = fetch.requests[0]?.init.headers as Record<string, string>;
    assert.equal(headers.accept, "application/vnd.github+json");
    assert.equal(headers["x-github-api-version"], "2022-11-28");
    assert.match(headers["user-agent"] ?? "", /devdoomscroll/);
    assert.equal("authorization" in headers, false);
  });

  it("sends the token as a bearer token on every search", async () => {
    const fetch = mockFetchBy(fakeGithub());

    await run({ token: "ghp_secret" });

    assert.equal(fetch.requests.length, TOPIC_COUNT);
    for (const request of fetch.requests) {
      assert.equal((request.init.headers as Record<string, string>).authorization, "Bearer ghp_secret");
    }
  });

  it("treats an empty token as no token", async () => {
    const fetch = mockFetchBy(fakeGithub());

    await run({ token: "" });

    assert.equal("authorization" in (fetch.requests[0]?.init.headers as object), false);
  });

  // The search API allows 10 requests a minute without a token and 30 with one.
  describe("pacing", () => {
    const secondRequestAfter = async (token: string | undefined, delayMs: number) => {
      const fetch = mockFetchBy(fakeGithub());
      const result = fetchGithub({ now: NOW, token });

      await flush();
      assert.equal(fetch.requests.length, 1, "the first search starts at once");
      mock.timers.tick(delayMs - 1);
      await flush();
      assert.equal(fetch.requests.length, 1, "still within the pause");
      mock.timers.tick(1);
      await flush();
      assert.equal(fetch.requests.length, 2, "the pause is over");

      await driveTimers(result, 10_000);
      assert.equal(fetch.requests.length, TOPIC_COUNT, "and no pause is left over at the end");
    };

    it("waits 6.5 s between searches without a token", async () => {
      await secondRequestAfter(undefined, 6_500);
    });

    it("waits 2.2 s between searches with a token", async () => {
      await secondRequestAfter("ghp_secret", 2_200);
    });
  });

  // The scraper's `since` is the newest stored repo; this adapter does not take one. Every
  // run asks for the same window, and the database skips what it already has.
  it("returns repos older than anything already stored", async () => {
    mockFetchBy(fakeGithub({ rust: [repo(1, { created_at: "2026-11-11T00:00:00Z" })] }));

    assert.deepEqual(
      (await run()).map((p) => p.publishedAt.toISOString()),
      ["2026-11-11T00:00:00.000Z"],
    );
  });

  it("makes one post of a repo found under several topics, with the tags of all of them", async () => {
    const shared = repo(1, { topics: ["python", "rust"], language: "Python" });
    const only = repo(2, { full_name: "bob/two", topics: ["python"], language: "Python" });
    mockFetchBy(fakeGithub({ python: [shared, only], rust: [shared] }));

    const posts = await run();

    assert.deepEqual(
      posts.map((p) => [p.externalId, p.tags]),
      [
        ["1", ["python", "rust"]],
        ["2", ["python"]],
      ],
    );
  });

  it("tags a repo from its topics and language as well as the topic it was found by", async () => {
    mockFetchBy(
      fakeGithub({
        docker: [repo(5, { topics: ["containers", "kubernetes"], language: "Go" })],
      }),
    );

    assert.deepEqual(
      (await run()).map((p) => p.tags),
      [["kubernetes", "go", "docker"]],
    );
  });

  it("drops repos that look star-farmed", async () => {
    mockFetchBy(
      fakeGithub({
        python: [
          repo(1, { stargazers_count: 363, forks_count: 0 }), // stars, nobody forked it
          repo(2, { stargazers_count: 100, forks_count: 82 }), // more forks than an audience explains
          repo(3), // a normal repo
        ],
      }),
    );

    assert.deepEqual(
      (await run()).map((p) => p.externalId),
      ["3"],
    );
  });

  describe("preview", () => {
    it("is null when the repo has no description", async () => {
      mockFetchBy(fakeGithub({ rust: [repo(1, { description: null }), repo(2, { description: "" })] }));

      assert.deepEqual(
        (await run()).map((p) => p.preview),
        [null, null],
      );
    });

    // Descriptions are plain text, not HTML: "<T>" is generics, not a tag to strip.
    it("keeps angle brackets and ampersands of a plain-text description", async () => {
      mockFetchBy(fakeGithub({ rust: [repo(1, { description: "Generic <T> utilities & helpers" })] }));

      const [post] = await run();

      assert.equal(post?.preview, "Generic <T> utilities & helpers");
    });

    it("is cut to 200 characters", async () => {
      mockFetchBy(fakeGithub({ rust: [repo(1, { description: "x".repeat(300) })] }));

      const [post] = await run();

      assert.equal(post?.preview?.length, 200);
    });
  });

  it("returns nothing when no topic has a matching repo", async () => {
    mockFetchBy(fakeGithub());

    assert.deepEqual(await run(), []);
    assert.deepEqual(logs.entries, []);
  });

  it("keeps the repos it got when GitHub says the results are incomplete, and logs it", async () => {
    mockFetchBy(fakeGithub({ rust: [repo(1)] }, {}, true));

    assert.deepEqual(
      (await run()).map((p) => p.externalId),
      ["1"],
    );
    assert.ok(logs.entries.some((e) => e.level === "warn" && e.msg.includes("incomplete")));
  });

  // A run takes minutes, so it reports what it is about to do, each search as it finishes,
  // and how it ended.
  describe("progress logging", () => {
    const python = GITHUB_TOPICS.findIndex((t) => t.topic === "python") + 1;
    const searched = () => logs.info.filter((e) => e.msg === "github: searched");

    it("says how many searches it will make and how long the pause between them is", async () => {
      mockFetchBy(fakeGithub());

      await run();

      const [start] = logs.info;
      assert.equal(start?.msg, "github: starting");
      assert.equal(start?.searches, TOPIC_COUNT);
      assert.equal(start?.spacingMs, 6_500);
      assert.equal(start?.authenticated, false);
      assert.equal(start?.estimatedSeconds, Math.round(((TOPIC_COUNT - 1) * 6_500) / 1_000));
    });

    it("reports the shorter pause, and a shorter estimate, when there is a token", async () => {
      mockFetchBy(fakeGithub());

      await run({ token: "ghp_secret" });

      const [start] = logs.info;
      assert.equal(start?.spacingMs, 2_200);
      assert.equal(start?.authenticated, true);
      assert.equal(start?.estimatedSeconds, Math.round(((TOPIC_COUNT - 1) * 2_200) / 1_000));
      assert.ok(!JSON.stringify(logs.info).includes("ghp_secret"), "the token is never logged");
    });

    it("logs every search as it finishes, with its position and what it found", async () => {
      const farmed = repo(2, { stargazers_count: 363, forks_count: 0 });
      mockFetchBy(fakeGithub({ python: [repo(1, { topics: ["python"] }), farmed] }));

      await run();

      const lines = searched();
      assert.deepEqual(
        lines.map((l) => [l.search, l.of]),
        GITHUB_TOPICS.map((_, i) => [i + 1, TOPIC_COUNT]),
      );
      assert.deepEqual(
        lines.map((l) => l.topic),
        GITHUB_TOPICS.map((t) => t.topic),
      );
      const line = lines[python - 1];
      assert.equal(line?.hits, 2);
      assert.equal(line?.kept, 1, "the star-farmed repo is not counted as kept");
      assert.equal(typeof line?.ms, "number");
    });

    it("keeps a running count of distinct repos, so a repo under two topics counts once", async () => {
      const shared = repo(1, { topics: ["python", "rust"], language: "Python" });
      mockFetchBy(fakeGithub({ python: [shared], rust: [shared] }));

      await run();

      const counts = searched().map((l) => l.repos);
      assert.equal(counts.at(-1), 1);
      assert.ok(
        counts.every((n, i) => i === 0 || (n as number) >= (counts[i - 1] as number)),
        "the count never goes down",
      );
      assert.equal(searched().filter((l) => l.kept === 1).length, 2, "both searches found it");
    });

    it("warns about a failed search at once, naming the topic and the error", async () => {
      mockFetchBy(fakeGithub({}, { docker: 403 }));

      await run();

      const failed = logs.entries.filter((e) => e.msg === "github: search failed");
      assert.equal(failed.length, 1);
      assert.equal(failed[0]?.level, "warn");
      assert.equal(failed[0]?.topic, "docker");
      assert.equal(failed[0]?.of, TOPIC_COUNT);
      assert.match(String(failed[0]?.error), /403/);
      assert.equal(searched().length, TOPIC_COUNT - 1, "a failed search is not reported as done");
    });

    it("ends with a summary of the run", async () => {
      mockFetchBy(fakeGithub({ rust: [repo(1)] }, { docker: 403 }));

      await run();

      const done = logs.info.at(-1);
      assert.equal(done?.msg, "github: finished");
      assert.equal(done?.searches, TOPIC_COUNT);
      assert.equal(done?.failed, 1);
      assert.equal(done?.repos, 1);
      assert.equal(typeof done?.ms, "number");
    });

    it("writes no summary when every search failed, since the scrape fails instead", async () => {
      mockFetchBy(() => new Response("", { status: 403 }));

      await assert.rejects(run(), /all \d+ searches failed/);

      assert.ok(!logs.info.some((e) => e.msg === "github: finished"));
    });
  });

  describe("when searches fail", () => {
    it("keeps the repos of the other topics and logs how many searches failed", async () => {
      mockFetchBy(fakeGithub({ rust: [repo(1)], python: [repo(2, { topics: ["python"] })] }, { docker: 403 }));

      const posts = await run();

      assert.deepEqual(
        posts.map((p) => p.externalId).sort(),
        ["1", "2"],
      );
      assert.ok(
        logs.entries.some(
          (e) => e.level === "warn" && e.msg.includes(`1 of ${TOPIC_COUNT} searches failed`),
        ),
      );
    });

    it("treats a malformed response as a failed search, not a crash", async () => {
      mockFetchBy((url) =>
        topicOf(url) === "docker"
          ? json({ total_count: 1, incomplete_results: false, items: [{ id: "not a number" }] })
          : fakeGithub({ rust: [repo(1)] })(url),
      );

      assert.deepEqual(
        (await run()).map((p) => p.externalId),
        ["1"],
      );
      assert.ok(logs.entries.some((e) => e.msg.includes(`1 of ${TOPIC_COUNT} searches failed`)));
    });

    it("fails the whole scrape when every search fails", async () => {
      mockFetchBy(() => new Response("", { status: 403 }));

      await assert.rejects(run(), new RegExp(`github: all ${TOPIC_COUNT} searches failed`));
    });

    it("rejects a response that does not have the expected shape", async () => {
      mockFetchBy(() => json({ message: "unexpected" }));

      await assert.rejects(run(), /github: all \d+ searches failed \(first error: .*Invalid input/s);
    });
  });
});
