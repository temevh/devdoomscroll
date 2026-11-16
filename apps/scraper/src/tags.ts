// The tags posts can have, shared by every source. Anything a source sends
// that isn't listed here (or aliased to it) is dropped.
const CANONICAL = [
  "ai",
  "android",
  "angular",
  "aws",
  "career",
  "cloud",
  "css",
  "database",
  "devops",
  "docker",
  "dotnet",
  "frontend",
  "gamedev",
  "git",
  "go",
  "html",
  "ios",
  "java",
  "javascript",
  "kotlin",
  "kubernetes",
  "linux",
  "machinelearning",
  "mobile",
  "nextjs",
  "node",
  "opensource",
  "php",
  "productivity",
  "python",
  "react",
  "rust",
  "security",
  "svelte",
  "swift",
  "testing",
  "typescript",
  "vue",
  "webdev",
] as const;

const ALIASES: Record<string, (typeof CANONICAL)[number]> = {
  js: "javascript",
  ts: "typescript",
  reactjs: "react",
  reactnative: "mobile",
  vuejs: "vue",
  nuxt: "vue",
  nodejs: "node",
  golang: "go",
  csharp: "dotnet",
  aspnet: "dotnet",
  k8s: "kubernetes",
  ml: "machinelearning",
  llm: "ai",
  genai: "ai",
  openai: "ai",
  chatgpt: "ai",
  artificialintelligence: "ai",
  cybersecurity: "security",
  infosec: "security",
  postgres: "database",
  postgresql: "database",
  sql: "database",
  mysql: "database",
  mongodb: "database",
  flutter: "mobile",
  web: "webdev",
  webdevelopment: "webdev",
  azure: "cloud",
  gcp: "cloud",
  serverless: "cloud",
  github: "git",
  oss: "opensource",
  tdd: "testing",
};

const canonical = new Set<string>(CANONICAL);
// A Map rather than the ALIASES object: looking "constructor" up in a plain object
// returns Object.prototype.constructor (a function), not undefined.
const aliases = new Map<string, string>(Object.entries(ALIASES));

/** "Node.js" -> "nodejs": lowercase letters and digits only. */
const toKey = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The canonical tag a key stands for, if any. */
const resolve = (key: string): string | undefined =>
  canonical.has(key) ? key : aliases.get(key);

/** Maps raw source tags to canonical ones, dropping the rest and duplicates. */
export function normalizeTags(raw: string[]): string[] {
  const tags = new Set<string>();
  for (const tag of raw) {
    const mapped = resolve(toKey(tag));
    if (mapped) tags.add(mapped);
  }
  return [...tags];
}

// Inference from free text, for sources whose posts carry no tags of their own.

// Characters that can sit inside a name ("Node.js", "C#", "C++"); anything else separates words.
const WORD_SEPARATOR = /[^A-Za-z0-9.#+]+/;
const TRAILING_PUNCTUATION = /[.#+]+$/;

// Too generic to mean the tag on their own ("web", "github", "node" as in a tree node).
// Their longer spellings still count: "webdev", "Node.js", "nodejs".
const NEVER_ALONE = new Set(["node", "web", "github"]);
// Ordinary English words: only counted when written the way the language is, "Go" / "Swift".
const CAPITALISED_ONLY = new Set(["go", "swift"]);

const isCapitalised = (word: string, key: string): boolean =>
  word.replace(TRAILING_PUNCTUATION, "") === key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The canonical tags a piece of free text (e.g. a Hacker News title) is about.
 * Looks at each word and each pair of neighbouring words ("machine learning",
 * "open source", "React Native"). One pass over the words with lookups built at
 * load time, so the cost grows linearly with the length of the text.
 */
export function inferTags(text: string): string[] {
  const tags = new Set<string>();
  let previous = "";
  for (const word of text.split(WORD_SEPARATOR)) {
    const key = toKey(word);
    if (!key) {
      previous = "";
      continue;
    }

    const tag = resolve(key);
    if (
      tag &&
      !NEVER_ALONE.has(key) &&
      (!CAPITALISED_ONLY.has(key) || isCapitalised(word, key))
    ) {
      tags.add(tag);
    }

    // Single letters would make pairs like "a" + "i" -> "ai" match by accident.
    if (previous.length > 1 && key.length > 1) {
      const pair = previous + key;
      const pairTag = resolve(pair);
      if (pairTag && !NEVER_ALONE.has(pair)) tags.add(pairTag);
    }
    previous = key;
  }
  return [...tags];
}
