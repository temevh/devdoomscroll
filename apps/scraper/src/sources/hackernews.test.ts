import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { json, mockFetch, restoreAll } from "../testing.ts";
import { fetchHackernews } from "./hackernews.ts";

const FRONT_PAGE =
  "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=100";

const hit = (over: Record<string, unknown> = {}) => ({
  objectID: "50519085",
  title: "Show HN: A Rust tool for parsing logs",
  url: "https://example.com/rust-tool",
  story_text: null,
  created_at_i: 1_794_844_947,
  points: 120,
  num_comments: 12,
  author: "someone",
  ...over,
});

const response = (hits: unknown[]) => json({ hits, nbHits: hits.length, page: 0 });

describe("fetchHackernews", () => {
  afterEach(restoreAll);

  it("maps a story to a post", async () => {
    mockFetch(response([hit({ title: "  Show HN: A Rust tool  " })]));

    assert.deepEqual(await fetchHackernews(), [
      {
        externalId: "50519085",
        title: "Show HN: A Rust tool",
        preview: null,
        url: "https://example.com/rust-tool",
        image: null,
        publishedAt: new Date(1_794_844_947 * 1000),
        tags: ["rust"],
      },
    ]);
  });

  it("makes a single request for the front page, with identifying headers", async () => {
    const fetch = mockFetch(response([]));

    await fetchHackernews();

    assert.equal(fetch.requests.length, 1);
    assert.equal(fetch.requests[0]?.url.href, FRONT_PAGE);
    const headers = fetch.requests[0]?.init.headers as Record<string, string>;
    assert.equal(headers.accept, "application/json");
    assert.match(headers["user-agent"] ?? "", /devdoomscroll/);
  });

  // The scraper's `since` is the newest stored story. A story can reach the front page
  // days after it was posted, so older stories must still come through (the database
  // ignores the ones it already has).
  it("returns stories older than anything already stored", async () => {
    const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 24 * 3600;
    mockFetch(
      response([
        hit({ objectID: "1", created_at_i: fiveDaysAgo }),
        hit({ objectID: "2", created_at_i: fiveDaysAgo + 4 * 24 * 3600 }),
      ]),
    );

    const posts = await fetchHackernews();

    assert.deepEqual(
      posts.map((p) => p.externalId),
      ["1", "2"],
    );
    assert.equal(posts[0]?.publishedAt.getTime(), fiveDaysAgo * 1000);
  });

  it("links to the discussion when a story has no url (Ask HN)", async () => {
    mockFetch(
      response([
        hit({ objectID: "777", title: "Ask HN: Which Rust crates do you trust?", url: null }),
        hit({ objectID: "778", title: "Ask HN: Is Python still worth learning?", url: "" }),
      ]),
    );

    const posts = await fetchHackernews();

    assert.deepEqual(
      posts.map((p) => p.url),
      ["https://news.ycombinator.com/item?id=777", "https://news.ycombinator.com/item?id=778"],
    );
  });

  it("turns story_text into a plain-text preview, decoding entities", async () => {
    mockFetch(
      response([hit({ story_text: "It&#x27;s a Rust tool &amp; it&#x2F;s fast" })]),
    );

    const [post] = await fetchHackernews();

    assert.equal(post?.preview, "It's a Rust tool & it/s fast");
  });

  // Hacker News has few enough stories that none are filtered out. Tags are only inferred
  // so that a story can show up under a followed tag; the rest stay untagged.
  it("infers tags from the title and keeps stories it cannot tag, untagged", async () => {
    mockFetch(
      response([
        hit({ objectID: "1", title: "Running an LLM on a laptop" }),
        hit({ objectID: "2", title: "The history of salt" }),
        hit({ objectID: "3", title: "Docker vs Podman for Python devs" }),
      ]),
    );

    const posts = await fetchHackernews();

    assert.deepEqual(
      posts.map((p) => [p.externalId, p.tags]),
      [
        ["1", ["ai"]],
        ["2", []],
        ["3", ["docker", "python"]],
      ],
    );
  });

  it("returns nothing for an empty front page", async () => {
    mockFetch(response([]));

    assert.deepEqual(await fetchHackernews(), []);
  });

  it("rejects when the response does not match the expected shape", async () => {
    mockFetch(response([hit({ title: "" })]));
    await assert.rejects(fetchHackernews(), { name: "ZodError" });

    restoreAll();
    mockFetch(json({ message: "unexpected" }));
    await assert.rejects(fetchHackernews(), { name: "ZodError" });
  });
});
