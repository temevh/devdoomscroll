import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  json,
  mockFetch,
  restoreAll,
  settle,
  silenceLogs,
  useFakeTimers,
} from "../testing.ts";
import { getJson } from "./getJson.ts";

const HEADERS = { accept: "application/json", "user-agent": "test" };
const URL = "https://example.test/things";

describe("getJson", () => {
  beforeEach(() => {
    useFakeTimers();
    silenceLogs(); // retries log a warning
  });
  afterEach(restoreAll);

  it("returns the parsed body of a successful response", async () => {
    const fetch = mockFetch(json({ ok: true }));

    assert.deepEqual(await getJson(URL, HEADERS, 3), { ok: true });
    assert.equal(fetch.requests.length, 1);
  });

  it("sends the headers and a timeout signal", async () => {
    const fetch = mockFetch(json({}));

    await getJson(URL, HEADERS, 3);

    const [request] = fetch.requests;
    assert.equal(request?.url.href, URL);
    assert.deepEqual(request?.init.headers, HEADERS);
    assert.ok(request?.init.signal instanceof AbortSignal);
  });

  it("does not retry client errors other than 429", async () => {
    const fetch = mockFetch(new Response("nope", { status: 404 }));

    await assert.rejects(
      getJson(URL, HEADERS, 3),
      /example\.test returned 404 for https:\/\/example\.test\/things/,
    );
    assert.equal(fetch.requests.length, 1);
  });

  it("retries 5xx responses after 2s, then 4s", async () => {
    const fetch = mockFetch(
      new Response("", { status: 503 }),
      new Response("", { status: 502 }),
      json({ ok: true }),
    );

    const result = getJson(URL, HEADERS, 5);

    await settle();
    assert.equal(fetch.requests.length, 1);
    mock.timers.tick(1_999);
    await settle();
    assert.equal(fetch.requests.length, 1, "still waiting for the 2s delay");
    mock.timers.tick(1);
    await settle();
    assert.equal(fetch.requests.length, 2);

    mock.timers.tick(4_000);
    assert.deepEqual(await result, { ok: true });
    assert.equal(fetch.requests.length, 3);
  });

  it("retries network errors", async () => {
    const fetch = mockFetch(new TypeError("fetch failed"), json({ ok: true }));

    const result = getJson(URL, HEADERS, 3);
    await settle();
    mock.timers.tick(2_000);

    assert.deepEqual(await result, { ok: true });
    assert.equal(fetch.requests.length, 2);
  });

  it("waits for Retry-After on a 429 when it is longer than the backoff", async () => {
    const fetch = mockFetch(
      new Response("", { status: 429, headers: { "retry-after": "10" } }),
      json({ ok: true }),
    );

    const result = getJson(URL, HEADERS, 3);
    await settle();
    mock.timers.tick(9_999);
    await settle();
    assert.equal(fetch.requests.length, 1);
    mock.timers.tick(1);

    assert.deepEqual(await result, { ok: true });
  });

  it("throws the last error once attempts are exhausted", async () => {
    const fetch = mockFetch(
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
    );

    const rejected = assert.rejects(getJson(URL, HEADERS, 3), /returned 500/);
    await settle();
    mock.timers.tick(2_000);
    await settle();
    mock.timers.tick(4_000);

    await rejected;
    assert.equal(fetch.requests.length, 3);
  });
});
