import { log } from "../logger.ts";
import { setTimeout as sleep } from "node:timers/promises";

/** GET with retries on 429, 5xx and network errors: waits 2s, 4s, 8s (or Retry-After). */
export async function getJson(
  url: string,
  HEADERS: { accept: string; "user-agent": string },
  MAX_ATTEMPTS: number,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    }).catch((err: Error) => err);
    if (res instanceof Response && res.ok) return res.json();

    const retryable =
      !(res instanceof Response) || res.status === 429 || res.status >= 500;
    const error =
      res instanceof Response
        ? new Error(`${new URL(url).host} returned ${res.status} for ${url}`)
        : res;
    if (!retryable || attempt === MAX_ATTEMPTS) throw error;

    const retryAfterMs =
      res instanceof Response
        ? Number(res.headers.get("retry-after")) * 1_000 || 0
        : 0;
    const delayMs = Math.max(2 ** attempt * 1_000, retryAfterMs);
    log.warn("http: retrying", {
      url,
      attempt,
      delayMs,
      error: error.message,
    });
    await sleep(delayMs);
  }
}
