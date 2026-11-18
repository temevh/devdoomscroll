// `npm run dev` from the repo root: the whole dev stack in one command.
//
//   1. Checks that the Supabase database the API uses is reachable. Prints the host and
//      the number of posts, never the credentials, and stops here if it cannot connect.
//   2. Starts the API server (apps/server, with `node --watch`) on API_PORT, default 8081.
//      8080 is the API's own default, but it is often taken by something else.
//   3. Starts the Vite dev server (apps/web) with its /api proxy pointed at that port.
//
// Ctrl+C, or either process dying, stops both. Needs only Node >= 22; no dependencies.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps/server");
const webDir = join(root, "apps/web");
const apiPort = Number(process.env.API_PORT ?? 8081);
const isWindows = process.platform === "win32";

const paint = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
const info = (message) => console.log(`${paint(2, "[dev]")} ${message}`);
const fail = (message) => {
  console.error(`${paint(31, "[dev]")} ${message}`);
  process.exit(1);
};

/** pg reports connection failures as an AggregateError with an empty message, so unpack it. */
function describe(err) {
  const nested = err instanceof AggregateError ? err.errors.map(describe).join("; ") : "";
  return [err?.code, err?.message, nested].filter(Boolean).join(": ") || String(err);
}

const portIsFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve(true)));
  });

async function checkDatabase() {
  // Same precedence as `node --env-file`: the environment wins over the .env file.
  const envFile = join(apiDir, ".env");
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const url = process.env.DATABASE_URL ?? fromFile.DATABASE_URL;
  if (!url) {
    fail("DATABASE_URL is not set. Put it in apps/server/.env (Supabase: Connect > Session pooler).");
  }

  let target;
  try {
    const parsed = new URL(url);
    target = `${parsed.host}${parsed.pathname}`; // host and database only, no user or password
  } catch {
    fail("DATABASE_URL in apps/server/.env is not a valid connection string.");
  }

  let pg;
  try {
    pg = createRequire(join(apiDir, "package.json"))("pg");
  } catch {
    fail("The server's dependencies are missing. Run `npm run install:all` first.");
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8_000 });
  try {
    await client.connect();
    const { rows } = await client.query("select count(*)::int as posts from posts");
    info(`Supabase ${target} reachable, ${rows[0].posts} posts`);
  } catch (err) {
    fail(`Cannot reach the database at ${target}: ${describe(err)}`);
  } finally {
    await client.end().catch(() => {});
  }
}

const children = [];
let stopping = false;

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM"); // the whole process group (see `detached` below)
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 300);
}

function start(label, color, args, cwd, env = {}) {
  // `node` directly, not via npm: no cmd.exe / npm.cmd layers to outlive a Ctrl+C on Windows.
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWindows,
  });
  const prefix = `${paint(color, `[${label}]`)} `;
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.setEncoding("utf8");
    let pending = "";
    stream.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
    stream.on("end", () => {
      if (pending) out.write(`${prefix}${pending}\n`);
    });
  }
  child.on("error", (err) => {
    info(`${label} could not start: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    info(`${label} stopped (${signal ?? `exit code ${code}`}), stopping the rest`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

function viteBin() {
  try {
    const require = createRequire(join(webDir, "package.json"));
    const manifestPath = require.resolve("vite/package.json");
    return join(dirname(manifestPath), require(manifestPath).bin.vite);
  } catch {
    return fail("Vite is not installed. Run `npm run install:all` first.");
  }
}

await checkDatabase();
if (!(await portIsFree(apiPort))) {
  fail(`Port ${apiPort} is already in use. Free it, or pick another one with API_PORT=<port>.`);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Same flags as `npm run dev` in apps/server; PORT is the only thing added.
start("api", 36, ["--watch", "--env-file-if-exists=.env", "index.ts"], apiDir, {
  PORT: String(apiPort),
});
// Same as `npm run dev` in apps/web (just `vite`); the proxy target is read by vite.config.ts.
start("web", 35, [viteBin()], webDir, { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` });

info(`API on http://localhost:${apiPort}, web proxies /api to it (Vite prints the web URL below). Ctrl+C stops both.`);
