import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  driveTimers,
  json,
  mockFetch,
  restoreAll,
  settle,
  silenceLogs,
  useFakeTimers,
} from "../testing.ts";
import { fetchDevto } from "./devto.ts";

const article = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: "Hello world",
  description: "A short intro",
  url: "https://dev.to/ann/hello-world",
  cover_image: null,
  social_image: null,
  published_at: "2026-11-10T12:00:00Z",
  tag_list: ["javascript"],
  language: "en",
  ...over,
});

/** `count` valid articles, newest first, the way the API returns them. */
const fullPage = (count: number, firstId: number) =>
  Array.from({ length: count }, (_, i) =>
    article({
      id: firstId + i,
      url: `https://dev.to/ann/post-${firstId + i}`,
      published_at: new Date(Date.UTC(2026, 10, 10) - i * 60_000).toISOString(),
    }),
  );

describe("fetchDevto", () => {
  let logs: ReturnType<typeof silenceLogs>;

  beforeEach(() => {
    useFakeTimers();
    logs = silenceLogs();
  });
  afterEach(restoreAll);

  it("maps an article to a post", async () => {
    mockFetch(json([article({ id: 7, title: "  Hello  ", tag_list: ["JS", "webdev"] })]));

    assert.deepEqual(await fetchDevto(null), [
      {
        externalId: "7",
        title: "Hello",
        preview: "A short intro",
        url: "https://dev.to/ann/hello-world",
        image: null,
        publishedAt: new Date("2026-11-10T12:00:00Z"),
        tags: ["javascript", "webdev"],
      },
    ]);
  });

  it("asks for the latest articles using the Forem API headers", async () => {
    const fetch = mockFetch(json([]));

    await fetchDevto(null);

    const [request] = fetch.requests;
    assert.equal(
      request?.url.href,
      "https://dev.to/api/articles/latest?per_page=100&page=1",
    );
    const headers = request?.init.headers as Record<string, string>;
    assert.equal(headers.accept, "application/vnd.forem.api-v1+json");
    assert.match(headers["user-agent"] ?? "", /devdoomscroll/);
  });

  it("prefers the cover image, then the social image, then none", async () => {
    mockFetch(
      json([
        article({ id: 1, cover_image: "https://img/cover.png", social_image: "https://img/social.png" }),
        article({ id: 2, cover_image: "", social_image: "https://img/social.png" }),
        article({ id: 3 }),
      ]),
    );

    const posts = await fetchDevto(null);

    assert.deepEqual(
      posts.map((p) => p.image),
      ["https://img/cover.png", "https://img/social.png", null],
    );
  });

  it("skips articles that are not in English", async () => {
    mockFetch(
      json([
        article({ id: 1, language: "en" }),
        article({ id: 2, language: "fi" }),
        article({ id: 3, language: null }),
      ]),
    );

    assert.deepEqual(
      (await fetchDevto(null)).map((p) => p.externalId),
      ["1"],
    );
  });

  it("skips articles without any known tag", async () => {
    mockFetch(
      json([
        article({ id: 1, tag_list: ["beginners", "tutorial"] }),
        article({ id: 2, tag_list: ["beginners", "python"] }),
        article({ id: 3, tag_list: [] }),
      ]),
    );

    const posts = await fetchDevto(null);

    assert.deepEqual(
      posts.map((p) => [p.externalId, p.tags]),
      [["2", ["python"]]],
    );
  });

  it("turns the description into a plain-text preview of at most 200 characters", async () => {
    mockFetch(
      json([
        article({ id: 1, description: "<p>Hello</p><p>big   world</p>" }),
        article({ id: 2, description: "x".repeat(300) }),
        article({ id: 3, description: "" }),
        article({ id: 4, description: null }),
        article({ id: 5, description: undefined }),
      ]),
    );

    const previews = (await fetchDevto(null)).map((p) => p.preview);

    assert.equal(previews[0], "Hello big world");
    assert.equal(previews[1]?.length, 200);
    assert.ok(previews[1]?.endsWith("…"));
    assert.deepEqual(previews.slice(2), [null, null, null]);
  });

  it("stops at the first article older than `since`, keeping one published exactly at it", async () => {
    const fetch = mockFetch(
      json([
        article({ id: 1, published_at: "2026-11-10T13:00:00Z" }),
        article({ id: 2, published_at: "2026-11-10T12:00:00Z" }),
        article({ id: 3, published_at: "2026-11-10T11:59:59Z" }),
        article({ id: 4, published_at: "2026-11-10T11:00:00Z" }),
      ]),
    );

    const posts = await fetchDevto(new Date("2026-11-10T12:00:00Z"));

    assert.deepEqual(
      posts.map((p) => p.externalId),
      ["1", "2"],
    );
    assert.equal(fetch.requests.length, 1);
  });

  it("does not fetch another page after a short one", async () => {
    const fetch = mockFetch(json(fullPage(99, 1)));

    assert.equal((await fetchDevto(null)).length, 99);
    assert.equal(fetch.requests.length, 1);
  });

  it("fetches the next page after a full one, waiting 1s in between", async () => {
    const fetch = mockFetch(json(fullPage(100, 1)), json(fullPage(1, 1_000)));

    const result = fetchDevto(null);
    await settle();
    assert.equal(fetch.requests.length, 1);
    mock.timers.tick(999);
    await settle();
    assert.equal(fetch.requests.length, 1, "still waiting between pages");
    mock.timers.tick(1);

    assert.equal((await result).length, 101);
    assert.equal(fetch.requests[1]?.url.searchParams.get("page"), "2");
  });

  it("stops after 5 pages and logs that older posts were skipped", async () => {
    const fetch = mockFetch(
      ...Array.from({ length: 5 }, (_, page) => json(fullPage(100, page * 100))),
    );

    const posts = await driveTimers(fetchDevto(null));

    assert.equal(posts.length, 500);
    assert.equal(fetch.requests.length, 5);
    assert.ok(logs.entries.some((e) => e.msg.includes("hit page limit")));
  });

  it("rejects when the response does not match the expected shape", async () => {
    mockFetch(json([article({ title: "" })]));

    await assert.rejects(fetchDevto(null), { name: "ZodError" });
  });
});
