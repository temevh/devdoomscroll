import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { json, mockFetchBy, restoreAll, settle, silenceLogs } from "../testing.ts";
import { fetchHackernews } from "./hackernews.ts";

const RANKED_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const EPOCH = 1_794_844_947; // seconds

const item = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  type: "story",
  by: "someone",
  time: EPOCH,
  score: 120,
  descendants: 12,
  kids: [1, 2],
  title: `Story ${id}`,
  url: `https://example.com/${id}`,
  ...over,
});

/**
 * A fake Hacker News API. `ranked` is the topstories list; every id in it answers with a
 * plain story unless `items` overrides it; `status` makes an id answer with that HTTP status.
 */
function fakeHn(
  ranked: unknown,
  items: Record<number, unknown> = {},
  status: Record<number, number> = {},
) {
  return (url: URL) => {
    if (url.href === RANKED_URL) return json(ranked);
    const id = Number(/\/item\/(\d+)\.json$/.exec(url.pathname)?.[1]);
    const code = status[id];
    if (code) return new Response("", { status: code });
    return json(id in items ? items[id] : item(id));
  };
}

const itemIdsRequested = (requests: Array<{ url: URL }>) =>
  requests
    .map((r) => /\/item\/(\d+)\.json$/.exec(r.url.pathname)?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number);

describe("fetchHackernews", () => {
  let logs: ReturnType<typeof silenceLogs>;

  beforeEach(() => {
    logs = silenceLogs();
  });
  afterEach(restoreAll);

  it("maps a ranked story to a post", async () => {
    mockFetchBy(
      fakeHn([101], {
        101: item(101, { title: "  Show HN: A Rust tool  ", url: "https://example.com/rust" }),
      }),
    );

    assert.deepEqual(await fetchHackernews(), [
      {
        externalId: "101",
        title: "Show HN: A Rust tool",
        preview: null,
        url: "https://example.com/rust",
        image: null,
        publishedAt: new Date(EPOCH * 1000),
        tags: ["rust"],
      },
    ]);
  });

  // Ten pages of 30, like the "More" link on news.ycombinator.com.
  it("reads the first 10 ranked pages: the top 300 of the 500 stories listed", async () => {
    const ranked = Array.from({ length: 500 }, (_, i) => 1_000 + i);
    const fetch = mockFetchBy(fakeHn(ranked));

    const posts = await fetchHackernews();

    assert.equal(posts.length, 300);
    assert.equal(fetch.requests.length, 301); // the list, then one request per story
    assert.equal(fetch.requests[0]?.url.href, RANKED_URL);
    assert.deepEqual(
      itemIdsRequested(fetch.requests).sort((a, b) => a - b),
      ranked.slice(0, 300),
    );
  });

  it("requests the item URL of each story", async () => {
    const fetch = mockFetchBy(fakeHn([7]));

    await fetchHackernews();

    assert.equal(
      fetch.requests[1]?.url.href,
      "https://hacker-news.firebaseio.com/v0/item/7.json",
    );
    const headers = fetch.requests[1]?.init.headers as Record<string, string>;
    assert.equal(headers.accept, "application/json");
    assert.match(headers["user-agent"] ?? "", /devdoomscroll/);
  });

  it("returns stories in rank order, even when the responses arrive out of order", async () => {
    mockFetchBy(async (url) => {
      const id = Number(/\/item\/(\d+)\.json$/.exec(url.pathname)?.[1]);
      for (let i = 0; i < 6 - id; i++) await settle(); // rank 1 answers last
      return fakeHn([1, 2, 3, 4, 5])(url);
    });

    assert.deepEqual(
      (await fetchHackernews()).map((p) => p.externalId),
      ["1", "2", "3", "4", "5"],
    );
  });

  it("has at most 10 story requests in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const answer = fakeHn(Array.from({ length: 50 }, (_, i) => i + 1));
    mockFetchBy(async (url) => {
      if (url.href === RANKED_URL) return answer(url);
      peak = Math.max(peak, ++inFlight);
      await settle();
      inFlight--;
      return answer(url);
    });

    await fetchHackernews();

    assert.equal(peak, 10);
  });

  // The scraper's `since` is the newest stored story. Ranked stories can be days old, and
  // the database already skips the ones it has, so nothing is filtered by age here.
  it("returns stories older than anything already stored", async () => {
    const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 24 * 3600;
    mockFetchBy(
      fakeHn([1, 2], { 1: item(1, { time: fiveDaysAgo }), 2: item(2, { time: fiveDaysAgo + 86_400 }) }),
    );

    const posts = await fetchHackernews();

    assert.deepEqual(
      posts.map((p) => p.publishedAt.getTime()),
      [fiveDaysAgo * 1000, (fiveDaysAgo + 86_400) * 1000],
    );
  });

  it("skips ids that are not live stories", async () => {
    mockFetchBy(
      fakeHn([1, 2, 3, 4, 5, 6], {
        1: null, // the API answers null for an id it does not have
        2: item(2, { deleted: true, title: undefined }),
        3: item(3, { dead: true }),
        4: item(4, { type: "job" }),
        5: item(5, { title: undefined }),
        6: item(6),
      }),
    );

    assert.deepEqual(
      (await fetchHackernews()).map((p) => p.externalId),
      ["6"],
    );
    assert.deepEqual(logs.entries, []); // skipping these is normal, not a warning
  });

  it("links to the discussion when a story has no url (Ask HN)", async () => {
    mockFetchBy(
      fakeHn([777, 778, 779], {
        777: item(777, { url: undefined }),
        778: item(778, { url: null }),
        779: item(779, { url: "" }),
      }),
    );

    assert.deepEqual(
      (await fetchHackernews()).map((p) => p.url),
      [777, 778, 779].map((id) => `https://news.ycombinator.com/item?id=${id}`),
    );
  });

  it("turns the story text into a plain-text preview, decoding entities", async () => {
    mockFetchBy(fakeHn([1], { 1: item(1, { text: "It&#x27;s a Rust tool &amp; it&#x2F;s fast" }) }));

    const [post] = await fetchHackernews();

    assert.equal(post?.preview, "It's a Rust tool & it/s fast");
  });

  // Every story is kept. The ones no tag fits go under "not-tagged", a tag row that exists
  // in the database, so they can still be found by following that tag.
  it("infers tags from the title and files the rest under 'not-tagged'", async () => {
    mockFetchBy(
      fakeHn([1, 2, 3], {
        1: item(1, { title: "Running an LLM on a laptop" }),
        2: item(2, { title: "The history of salt" }),
        3: item(3, { title: "Docker vs Podman for Python devs" }),
      }),
    );

    assert.deepEqual(
      (await fetchHackernews()).map((p) => [p.externalId, p.tags]),
      [
        ["1", ["ai"]],
        ["2", ["not-tagged"]],
        ["3", ["docker", "python"]],
      ],
    );
  });

  it("returns nothing for an empty ranking", async () => {
    const fetch = mockFetchBy(fakeHn([]));

    assert.deepEqual(await fetchHackernews(), []);
    assert.equal(fetch.requests.length, 1);
  });

  describe("when requests fail", () => {
    it("keeps the stories it did get and logs how many failed", async () => {
      mockFetchBy(fakeHn([1, 2, 3], {}, { 2: 404 }));

      const posts = await fetchHackernews();

      assert.deepEqual(
        posts.map((p) => p.externalId),
        ["1", "3"],
      );
      assert.ok(
        logs.entries.some((e) => e.level === "warn" && e.msg.includes("1 of 3 story fetches failed")),
      );
    });

    it("treats a malformed story as a failed fetch, not a crash", async () => {
      mockFetchBy(fakeHn([1, 2], { 2: item(2, { time: "yesterday" }) }));

      assert.deepEqual(
        (await fetchHackernews()).map((p) => p.externalId),
        ["1"],
      );
      assert.ok(logs.entries.some((e) => e.msg.includes("1 of 2 story fetches failed")));
    });

    it("fails the whole scrape when every story fetch fails", async () => {
      mockFetchBy(fakeHn([1, 2, 3], {}, { 1: 404, 2: 404, 3: 404 }));

      await assert.rejects(fetchHackernews(), /all 3 story fetches failed/);
    });

    it("fails when the ranking cannot be fetched", async () => {
      mockFetchBy(() => new Response("", { status: 404 }));

      await assert.rejects(fetchHackernews(), /returned 404/);
    });

    it("rejects a ranking that does not have the expected shape", async () => {
      mockFetchBy(fakeHn({ message: "unexpected" }));

      await assert.rejects(fetchHackernews(), { name: "ZodError" });
    });
  });
});
