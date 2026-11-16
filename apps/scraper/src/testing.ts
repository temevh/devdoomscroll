// Helpers shared by the *.test.ts files (run with `npm test`). Not used by the worker.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import { mock } from "node:test";

export const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

type Reply = Response | Error;

/**
 * Replaces global fetch. Each call consumes the next reply (an Error is thrown
 * like a network failure) and fails the test if there are more calls than replies.
 */
export function mockFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, _init?: RequestInit) => {
      const next = queue.shift();
      assert.ok(next, "fetch was called more times than expected");
      if (next instanceof Error) throw next;
      return next;
    },
  );
  return {
    /** Every request made so far, in order. */
    get requests() {
      return fetchMock.mock.calls.map((c) => ({
        url: new URL(String(c.arguments[0])),
        init: c.arguments[1] ?? {},
      }));
    },
  };
}

/**
 * Fakes setTimeout, including the `sleep` the code imports from
 * node:timers/promises. That import is a snapshot of the builtin module, so
 * it has to be re-synced after the mock is installed (and again on reset).
 */
export function useFakeTimers() {
  mock.timers.enable({ apis: ["setTimeout"] });
  syncBuiltinESMExports();
}

export function restoreAll() {
  mock.timers.reset();
  mock.restoreAll();
  syncBuiltinESMExports();
}

/**
 * Silences log.warn/log.error output (it goes to console.error) and returns
 * the logged entries, parsed, so tests can assert on them.
 */
export function silenceLogs() {
  const spy = mock.method(console, "error", () => {});
  return {
    get entries(): Array<{ level: string; msg: string }> {
      return spy.mock.calls.map((c) => JSON.parse(String(c.arguments[0])));
    },
  };
}

/** Lets pending promise callbacks run (setImmediate is not faked). */
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Advances the fake clock by `stepMs` until `promise` settles, then returns its result. */
export async function driveTimers<T>(promise: Promise<T>, stepMs = 1_000): Promise<T> {
  let finished = false;
  const result = promise.finally(() => {
    finished = true;
  });
  result.catch(() => {}); // the caller awaits `result`; avoid an unhandled-rejection report meanwhile
  while (!finished) {
    await settle();
    mock.timers.tick(stepMs);
  }
  return result;
}

/**
 * Median wall-clock time of `fn` in milliseconds over `runs` timed runs, after one
 * untimed warm-up call so V8 has optimised it. The median means a single noisy run
 * (GC pause, busy CI machine) can't fail a timing test on its own.
 */
export function medianMs(fn: () => void, runs = 5): number {
  fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}
