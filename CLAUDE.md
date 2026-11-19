# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

doom.dev ("devdoomscroll"): a feed of developer posts from dev.to, Stack Overflow and Hacker News, filterable by tag. Three independent apps under `apps/`, sharing one Supabase Postgres database. There are no npm workspaces; each app has its own `package.json` and `node_modules`.

- `apps/scraper` (`@doom/worker`): long-running worker that pulls posts from sources into Postgres.
- `apps/server` (`@doom/server`): Fastify read-only API (`GET /posts`, `GET /tags`, `GET /ping`) over the same DB. Deployed on Render.
- `apps/web` (`@doom/web`): Vue 3 + Vite + Tailwind 4 SPA. Deployed on Vercel.
- `supabase/migrations`: the schema and source seed rows (Supabase CLI is a root devDependency).

## Commands

Run from the repo root (these proxy into the apps with `--prefix`):

```
npm run install:all     # root + all three apps
npm run dev             # API (on :8081) + Vite together; checks the Supabase DB is reachable first
npm run scraper:dev     # worker with --watch
npm run scrape:all      # one forced scrape of every source, then exit
npm run server:dev      # API on :8080 (PORT to override)
npm run web:dev         # Vite dev server; /api is proxied to localhost:8080
npm run web:build       # type-check + vite build
npm test                # scraper tests, then web tests (each runs once)
```

Per-app (cd into the app, or use `--prefix apps/<app>`):

- scraper: `npm test` (Node's built-in runner), `npm run test:utils` (only the fast pure-function tests in `src/utils.test.ts`), `npm run scrape:once` (scrape only sources that are due, then exit), `npm run typecheck`
- server: `npm run typecheck` (no tests)
- web: `npm run lint` (oxlint then eslint, both with `--fix`), `npm run format`, `npm run type-check`, `npm run test:unit` (vitest, watch mode)
- single scraper test file: `node --test src/utils.test.ts` (from `apps/scraper`; add `--test-name-pattern=<text>` for one test)
- single web test file: `npx vitest run src/lib/__tests__/timeAgo.spec.ts` (from `apps/web`; add `-t "<name>"` for one test)

Supabase: `npx supabase ...` from the root (`supabase/config.toml`, project_id `doom.dev`). Add schema changes as new files in `supabase/migrations/`.

## Environment

`.env` files are gitignored and loaded with `node --env-file-if-exists`.

- scraper: `DATABASE_URL` (required, a `postgresql://` URL; Supabase "Session pooler"), `TICK_SECONDS` (default 60), `LOG_LEVEL`, `GITHUB_TOKEN` (optional; raises GitHub's search limit from 10 to 30 requests a minute)
- server: `DATABASE_URL` (required), `PORT` (default 8080)
- `npm run dev` (`scripts/dev.mjs`, no dependencies): connects to the `DATABASE_URL` in `apps/server/.env` and prints the host and post count (never credentials), then runs the API with `PORT=$API_PORT` (default 8081, because 8080 is often taken by other software) and Vite with `API_PROXY_TARGET` pointing at it, which `apps/web/vite.config.ts` reads for its `/api` proxy (default `http://localhost:8080`, so `npm run web:dev` alone is unchanged). It runs `node` directly rather than through npm, and kills the whole process tree on exit. If the API crashes under `node --watch` it stays up waiting for a file change (the usual watch behaviour), so the launcher keeps running.
- web: `VITE_API_BASE_URL` (default `/api`). In dev Vite proxies `/api` to `:8080`; in prod `apps/web/vercel.json` rewrites `/api/*` to the Render server.

## Architecture

**Scraper flow** (`apps/scraper/src/main.ts`): a tick loop (every `TICK_SECONDS`) walks the `SOURCES` map. For each source it calls `isDue()`, which compares the last `scrape_runs.started_at` with `sources.scrape_interval_minutes` (180 = every 3h). The schedule therefore lives in the database and survives restarts. A due source gets a `scrape_runs` row (`running`, then `succeed` or `failed`). The adapter is called with `since` = the newest `published_at` already stored for that source, then `savePosts()` upserts posts, tags and `post_tags` in one transaction, using `ON CONFLICT DO NOTHING` on `(source_id, external_id)`. A failing source is logged and skipped, never fatal. `--once` runs a single pass; `--force` ignores the schedule.

**Source adapters** (`apps/scraper/src/sources/*.ts`): each exports `fetchX(since: Date | null): Promise<Post[]>`. Chronological adapters (dev.to, Stack Overflow) page newest-first, stop at the first post older than `since`, and cap at 5 pages. `fetchHackernews()` takes no `since` on purpose: it reads HN's own ranking from the official Firebase API (the first 10 pages of 30, i.e. the top 300: one request for the list, then one per story, 10 at a time through `utils/concurrency.ts`), and ranked stories can be days old, so a `since` cutoff would drop them; the database's unique `(source_id, external_id)` skips the ones already stored. Some story fetches failing is logged and tolerated; all of them failing fails the scrape. `fetchGithub()` also takes no `since`: it runs one repository search per canonical tag (`GITHUB_TOPICS` in `utils/github.ts`: 38 of the 40, `career` and `opensource` are skipped), each the top 30 repos by stars among those created in the last 7 days with at least 20 stars and 3 forks. Fresh repos ranked by stars are full of topic-stuffed repos with hundreds of stars and next to no forks, so `isOrganic` also requires forks/stars between 0.02 and 0.5. Searches run one at a time with a pause (6.5 s, or 2.2 s with `GITHUB_TOKEN`) to stay under GitHub's search limit, so a run takes about 4 minutes (about 100 s with a token); some searches failing is logged and tolerated, all failing fails the scrape. A repo found under several topics is one post with all their tags, and its `image` is GitHub's social-preview card, which shows the stars (the `posts` table has no star column). They share `utils/getJson.ts` (timeout, retry with backoff on 429/5xx) and are polite about rate limits (sleeps, `quota_remaining`, `backoff`).

**Adding a source** takes three things: an adapter in `sources/`, an entry in the `SOURCES` map in `main.ts` (plus the re-export in `sources/index.ts`), and a migration that inserts the `sources` row. The scraper skips any source without an enabled row. Optionally add a badge colour for the id in `apps/web/src/components/post/SourceIcon.vue` (`devto`, `stackoverflow`, `hackernews`, `lobsters`, `github` and `reddit` already have one).

**Tags**: `apps/scraper/src/tags.ts` holds a closed `CANONICAL` list plus `ALIASES`. `normalizeTags()` drops every source tag not in the list, and posts left with no tags are skipped, except for Hacker News. HN sends no tags, so `inferTags(title)` tags what it can (it matches single words and neighbouring word pairs against the same names and aliases; `Go` and `Swift` count only when capitalised, and bare `node`, `web` and `github` never count) and stories no tag fits are filed under `not-tagged` (`NOT_TAGGED` in `tags.ts`, a row in the `tags` table) instead of being dropped, so every HN story has a tag. `NOT_TAGGED` is deliberately not in `CANONICAL`: `normalizeTags` strips punctuation and would turn it into `nottagged`. The web tag picker is fed by `GET /tags`, which reads the `tags` table. A canonical tag only shows up once a post has used it.

**API** (`apps/server/index.ts`, single file): `GET /posts?tags=a,b&limit=&cursor=` returns posts that have at least one of the tags, newest first. Pagination is keyset on `(published_at, id)`, with an opaque base64url cursor and `nextCursor`. Errors are RFC 9457 `application/problem+json`. The contract is in `docs/api/openapi.yaml`.

**Web**: `src/api/client.ts` is a thin typed fetch wrapper (`ApiError`; array query values are serialized as `?tags=a,b`). `src/api/index.ts` exposes `api.posts.list` and `api.tags.list`. Followed tags are stored in `localStorage` (`doom.followedTags`) via `composables/useFollowedTags.ts`; there is no user account.

## Testing

- **Scraper** uses `node:test` (no extra dependency); tests sit beside the code as `src/**/*.test.ts`. They stub `globalThis.fetch` and never touch a network or database. `src/utils.test.ts` is the one file for the pure utility functions (`normalizeTags`, `inferTags`, `describeError`, `mapSettled`, `toText`/`toPreview`, and the GitHub helpers `searchQuery`/`isOrganic`/`repoTags`): no fetch stubs, no fake timers, no I/O, run alone with `npm run test:utils`. Its last block holds loose timing checks (budgets about 10x the measured median, with the measurement noted beside each) to catch order-of-magnitude slowdowns. `src/testing.ts` has the shared helpers (`mockFetch` answers by call order; `mockFetchBy` answers by URL, which concurrent requests need; fake timers, log capture, `medianMs`). Fake timers only reach the `sleep` the code imports from `node:timers/promises` after `syncBuiltinESMExports()`, so use `useFakeTimers()`/`restoreAll()` from that file rather than calling `mock.timers` directly; otherwise tests really sleep for seconds.
- **Web** uses vitest, with specs in `__tests__/*.spec.ts` folders (the layout the tsconfig and eslint config expect). Specs inject their own in-memory `localStorage` via `vi.stubGlobal`, because Node 25's built-in `localStorage` shadows jsdom's and is unusable without `--localstorage-file`. `api/client.ts` reads `VITE_API_BASE_URL` at import, so its spec calls `vi.resetModules()` and re-imports per test.
- **CI:** `.github/workflows/test.yml` runs on every push to any branch: three parallel jobs (scraper, web, server) on Node 24, each doing `npm ci` in its app, then the typecheck (`typecheck` / `type-check`), then the tests (scraper and web only; the server has none; the scraper job runs `test:utils` before the full suite). There is no lint step. Each app is installed on its own, so a dependency that only resolves from the root `node_modules` fails in CI even if it works locally (this is how the server was found to be missing `@types/pg`).
- **Not covered:** `apps/scraper/src/db.ts` (`isDue`, `savePosts`; needs a real Postgres) and `apps/server` (`index.ts` parses env and starts listening at import, and `encodeCursor`/`decodeCursor` aren't exported). Testing them means extracting those pieces first. Vue components have no tests either.

## Gotchas

- **Schema types are duplicated by hand.** The Kysely `Database` interface lives in both `apps/scraper/src/db.ts` and `apps/server/types.ts` (the server's version also has `sources.name`). The web `src/types.ts` mirrors `docs/api/openapi.yaml`. When the schema or API shape changes, update all of them.
- **TypeScript runs unbuilt.** Scraper and server run `.ts` directly on Node >= 22.18 (type stripping, no build step). Imports must use the `.ts` extension, and `verbatimModuleSyntax` requires `import type`. Avoid non-erasable syntax (`enum`, `namespace`, parameter properties). `tsc` is only for `typecheck` (`noEmit`).
- **Docs are partly aspirational.** `docs/stack.md` and `docs/architecture.md` mention Nuxt, a Redis cache, and ordering by `ingested_at`. None of these exist; the app is plain Vite + Vue and queries Postgres directly. `docs/plan.md` is the v1 scope and source wishlist. A comment in the devto seed migration refers to `apps/worker`; that directory is now `apps/scraper`.
- **Style differs per app.** `apps/web` is Prettier-enforced (no semicolons, single quotes, width 100). Scraper and server use semicolons and double quotes, with no linter configured.
