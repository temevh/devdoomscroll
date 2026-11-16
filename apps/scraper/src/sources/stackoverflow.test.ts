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
import { fetchStackoverflow } from "./stackoverflow.ts";

const CREATED = 1_762_000_000; // epoch seconds

const question = (over: Record<string, unknown> = {}) => ({
  tags: ["javascript"],
  owner: { user_type: "registered", display_name: "Ann" },
  is_answered: false,
  view_count: 10,
  answer_count: 0,
  score: 1,
  last_activity_date: CREATED,
  creation_date: CREATED,
  question_id: 42,
  link: "https://stackoverflow.com/questions/42/how-do-i",
  title: "How do I do it?",
  body: "<p>Some body text</p>",
  ...over,
});

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  has_more: false,
  quota_remaining: 300,
  ...over,
});

describe("fetchStackoverflow", () => {
  let logs: ReturnType<typeof silenceLogs>;

  beforeEach(() => {
    useFakeTimers();
    logs = silenceLogs();
  });
  afterEach(restoreAll);

  it("maps a question to a post", async () => {
    mockFetch(
      json(
        page([
          question({
            question_id: 7,
            title: "Why does &lt;div&gt; &amp; CSS break?",
            body: "<p>Hello</p><pre><code>x = 1</code></pre>",
            tags: ["reactjs", "css"],
          }),
        ]),
      ),
    );

    const [post, ...rest] = await fetchStackoverflow(null);

    assert.equal(rest.length, 0);
    assert.deepEqual(post, {
      externalId: "7",
      title: "Why does <div> & CSS break?",
      preview: post?.preview, // asserted separately: the text rendering is html-to-text's
      url: "https://stackoverflow.com/questions/42/how-do-i",
      image: null,
      publishedAt: new Date(CREATED * 1000),
      tags: ["react", "css"],
    });
    assert.match(post?.preview ?? "", /^Hello\s+x = 1$/);
  });

  it("queries the newest questions with their body", async () => {
    const fetch = mockFetch(json(page([])));

    await fetchStackoverflow(null);

    const url = fetch.requests[0]?.url ?? new URL("about:blank");
    assert.equal(
      `${url.origin}${url.pathname}`,
      "https://api.stackexchange.com/2.3/questions",
    );
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      site: "stackoverflow",
      order: "desc",
      sort: "creation",
      filter: "withbody",
      pagesize: "100",
      page: "1",
    });
  });

  it("only asks for questions newer than `since`, in epoch seconds", async () => {
    const fetch = mockFetch(json(page([])));

    await fetchStackoverflow(new Date(1_762_000_000_500));

    assert.equal(fetch.requests[0]?.url.searchParams.get("fromdate"), "1762000000");
  });

  it("skips closed questions", async () => {
    mockFetch(
      json(
        page([
          question({ question_id: 1 }),
          question({ question_id: 2, closed_date: CREATED + 60, closed_reason: "Duplicate" }),
        ]),
      ),
    );

    assert.deepEqual(
      (await fetchStackoverflow(null)).map((p) => p.externalId),
      ["1"],
    );
  });

  it("skips questions without any known tag", async () => {
    mockFetch(
      json(
        page([
          question({ question_id: 1, tags: ["regex", "string"] }),
          question({ question_id: 2, tags: ["regex", "python"] }),
        ]),
      ),
    );

    const posts = await fetchStackoverflow(null);

    assert.deepEqual(
      posts.map((p) => [p.externalId, p.tags]),
      [["2", ["python"]]],
    );
  });

  it("has no preview when the question has no body", async () => {
    mockFetch(json(page([question({ body: undefined }), question({ question_id: 43, body: "" })])));

    assert.deepEqual(
      (await fetchStackoverflow(null)).map((p) => p.preview),
      [null, null],
    );
  });

  it("truncates the preview to 200 characters", async () => {
    mockFetch(json(page([question({ body: `<p>${"x".repeat(300)}</p>` })])));

    const [post] = await fetchStackoverflow(null);

    assert.equal(post?.preview?.length, 200);
    assert.ok(post?.preview?.endsWith("…"));
  });

  it("stops at the first question older than `since`", async () => {
    const fetch = mockFetch(
      json(
        page(
          [
            question({ question_id: 1, creation_date: CREATED + 120 }),
            question({ question_id: 2, creation_date: CREATED }),
            question({ question_id: 3, creation_date: CREATED - 1 }),
          ],
          { has_more: true },
        ),
      ),
    );

    const posts = await fetchStackoverflow(new Date(CREATED * 1000));

    assert.deepEqual(
      posts.map((p) => p.externalId),
      ["1", "2"],
    );
    assert.equal(fetch.requests.length, 1);
  });

  it("does not fetch another page when there are no more", async () => {
    const fetch = mockFetch(json(page([question()], { has_more: false })));

    await fetchStackoverflow(null);

    assert.equal(fetch.requests.length, 1);
  });

  it("fetches the next page after waiting for the API's `backoff`", async () => {
    const fetch = mockFetch(
      json(page([question({ question_id: 1 })], { has_more: true, backoff: 3 })),
      json(page([question({ question_id: 2 })])),
    );

    const result = fetchStackoverflow(null);
    await settle();
    mock.timers.tick(2_999);
    await settle();
    assert.equal(fetch.requests.length, 1, "still backing off");
    mock.timers.tick(1);

    assert.deepEqual(
      (await result).map((p) => p.externalId),
      ["1", "2"],
    );
    assert.equal(fetch.requests[1]?.url.searchParams.get("page"), "2");
  });

  it("waits at least 1s between pages when the API sends no `backoff`", async () => {
    const fetch = mockFetch(json(page([], { has_more: true })), json(page([])));

    const result = fetchStackoverflow(null);
    await settle();
    mock.timers.tick(999);
    await settle();
    assert.equal(fetch.requests.length, 1);
    mock.timers.tick(1);
    await result;

    assert.equal(fetch.requests.length, 2);
  });

  it("stops early, keeping what it has, when the daily quota is nearly used up", async () => {
    const fetch = mockFetch(
      json(page([question()], { has_more: true, quota_remaining: 9 })),
    );

    const posts = await fetchStackoverflow(null);

    assert.equal(posts.length, 1);
    assert.equal(fetch.requests.length, 1);
    assert.ok(logs.entries.some((e) => e.msg.includes("quota nearly used up")));
  });

  it("stops after 5 pages and logs that older posts were skipped", async () => {
    const fetch = mockFetch(
      ...Array.from({ length: 5 }, (_, i) =>
        json(page([question({ question_id: i + 1 })], { has_more: true })),
      ),
    );

    const posts = await driveTimers(fetchStackoverflow(null));

    assert.equal(posts.length, 5);
    assert.equal(fetch.requests.length, 5);
    assert.ok(logs.entries.some((e) => e.msg.includes("hit page limit")));
  });

  it("rejects when the response does not match the expected shape", async () => {
    mockFetch(json({ items: [{ title: "no other fields" }], has_more: false }));

    await assert.rejects(fetchStackoverflow(null), { name: "ZodError" });
  });
});
