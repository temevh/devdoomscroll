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

/** Maps raw source tags to canonical ones, dropping the rest and duplicates. */
export function normalizeTags(raw: string[]): string[] {
  const tags = new Set<string>();
  for (const tag of raw) {
    const key = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
    const mapped = canonical.has(key) ? key : ALIASES[key];
    if (mapped) tags.add(mapped);
  }
  return [...tags];
}
