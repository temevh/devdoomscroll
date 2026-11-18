// All the pure utility functions in one fast file: `npm run test:utils`.
// Rules for this file: no fetch stubs, no fake timers, no I/O, so it runs in a
// few milliseconds. Tests that need those (getJson, the adapters) live elsewhere.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError } from "./logger.ts";
import { CANONICAL, inferTags, normalizeTags } from "./tags.ts";
import { medianMs } from "./testing.ts";
import { mapSettled } from "./utils/concurrency.ts";
import {
  GITHUB_TOPICS,
  SKIPPED_TAGS,
  isOrganic,
  repoTags,
  searchQuery,
} from "./utils/github.ts";
import { toPreview, toText } from "./utils/text.ts";

describe("normalizeTags", () => {
  it("keeps canonical tags", () => {
    assert.deepEqual(normalizeTags(["python", "rust"]), ["python", "rust"]);
  });

  it("maps aliases to their canonical tag", () => {
    assert.deepEqual(normalizeTags(["js", "nodejs", "k8s", "postgres"]), [
      "javascript",
      "node",
      "kubernetes",
      "database",
    ]);
  });

  it("ignores case, punctuation and whitespace", () => {
    assert.deepEqual(
      normalizeTags(["JavaScript", "Node.js", "machine-learning", "React Native"]),
      ["javascript", "node", "machinelearning", "mobile"],
    );
  });

  it("drops tags that are neither canonical nor aliased", () => {
    assert.deepEqual(normalizeTags(["beginners", "tutorial", "python", "c++"]), ["python"]);
  });

  // Stack Overflow's tag is literally "c#", which used to be reduced to "c" and dropped.
  it("keeps c# as its own csharp tag, however it is spelled", () => {
    assert.deepEqual(normalizeTags(["c#"]), ["csharp"]);
    assert.deepEqual(normalizeTags(["C#", "csharp", "CSharp"]), ["csharp"]);
    assert.deepEqual(normalizeTags(["c#", "dotnet", "aspnet"]), ["csharp", "dotnet"]);
  });

  it("does not mistake C or C++ for C#", () => {
    assert.deepEqual(normalizeTags(["c", "c++", "objective-c"]), []);
  });

  it("returns each canonical tag once, even when aliases collapse into it", () => {
    assert.deepEqual(normalizeTags(["js", "JavaScript", "javascript"]), ["javascript"]);
    assert.deepEqual(normalizeTags(["ai", "llm", "chatgpt", "openai"]), ["ai"]);
  });

  it("keeps the order in which tags first appear", () => {
    assert.deepEqual(normalizeTags(["rust", "js", "python", "ts"]), [
      "rust",
      "javascript",
      "python",
      "typescript",
    ]);
  });

  it("returns an empty list for no input", () => {
    assert.deepEqual(normalizeTags([]), []);
  });

  // "constructor" is a real Stack Overflow tag. Looked up in a plain object it resolves
  // to Object.prototype.constructor, a function, which used to come back as a tag.
  it("ignores tags named like built-in object members", () => {
    assert.deepEqual(normalizeTags(["javascript", "constructor"]), ["javascript"]);
  });
});

describe("inferTags", () => {
  it("finds canonical tag names in a title", () => {
    assert.deepEqual(inferTags("Rust 2.0 released"), ["rust"]);
    assert.deepEqual(inferTags("PYTHON is fast now"), ["python"]);
  });

  it("maps aliases to their canonical tag", () => {
    assert.deepEqual(inferTags("Running an LLM on a laptop"), ["ai"]);
    assert.deepEqual(inferTags("Postgres tricks"), ["database"]);
  });

  it("recognises two-word names", () => {
    assert.deepEqual(inferTags("Machine learning at scale"), ["machinelearning"]);
    assert.deepEqual(inferTags("Choosing an open source license"), ["opensource"]);
    assert.deepEqual(inferTags("React Native in 2026"), ["react", "mobile"]);
  });

  it("copes with prefixes, hyphens, possessives and trailing punctuation", () => {
    assert.deepEqual(inferTags("Show HN: A Rust-based tool"), ["rust"]);
    assert.deepEqual(inferTags("Rust’s borrow checker, explained."), ["rust"]);
    assert.deepEqual(inferTags("(Docker) and Kubernetes!"), ["docker", "kubernetes"]);
  });

  describe("ambiguous words", () => {
    it("counts Go and Swift only when capitalised like the language", () => {
      assert.deepEqual(inferTags("Go 1.24 released"), ["go"]);
      assert.deepEqual(inferTags("Why I go to work"), []);
      assert.deepEqual(inferTags("Swift 6 concurrency model"), ["swift"]);
      assert.deepEqual(inferTags("Taylor swift tickets"), []);
    });

    it("counts Node only as Node.js / nodejs, never as a bare word", () => {
      assert.deepEqual(inferTags("Node.js 24 released"), ["node"]);
      assert.deepEqual(inferTags("nodejs memory leaks"), ["node"]);
      assert.deepEqual(inferTags("A linked list of node pointers"), []);
    });

    it("ignores the generic words web and github", () => {
      assert.deepEqual(inferTags("Web scraping at scale"), []);
      assert.deepEqual(inferTags("GitHub Actions outage"), []);
      assert.deepEqual(inferTags("A webdev roadmap"), ["webdev"]);
    });
  });

  it("returns each tag once, in order of first appearance", () => {
    assert.deepEqual(inferTags("Python, Rust and python again"), ["python", "rust"]);
    assert.deepEqual(inferTags("JS and JavaScript and TS"), ["javascript", "typescript"]);
    assert.deepEqual(inferTags("Docker and Kubernetes (k8s)"), ["docker", "kubernetes"]);
  });

  it("does not join stray single letters into a tag name", () => {
    assert.deepEqual(inferTags("Plan A I prefer"), []); // "a" + "i" would spell "ai"
    assert.deepEqual(inferTags("Vitamin G O"), []); // "g" + "o" would spell "go"
  });

  it("finds nothing in titles about other topics", () => {
    assert.deepEqual(inferTags("The history of salt"), []);
    assert.deepEqual(inferTags("C++ and Fortran"), []);
  });

  it("recognises C# but not C or C++", () => {
    assert.deepEqual(inferTags("C# 14 released"), ["csharp"]);
    assert.deepEqual(inferTags("Why (C#) and C++ differ"), ["csharp"]);
    assert.deepEqual(inferTags("A C# tip. C#, F# and C"), ["csharp"]);
    assert.deepEqual(inferTags("Learning C and C++"), []);
  });

  it("returns an empty list for empty or blank titles", () => {
    assert.deepEqual(inferTags(""), []);
    assert.deepEqual(inferTags("   \n\t "), []);
  });

  it("ignores words named like built-in object members", () => {
    assert.deepEqual(inferTags("JavaScript constructor pitfalls"), ["javascript"]);
  });
});

describe("describeError", () => {
  it("stringifies values that are not errors", () => {
    assert.equal(describeError("boom"), "boom");
    assert.equal(describeError(42), "42");
  });

  it("includes the name and message", () => {
    assert.equal(describeError(new TypeError("bad input")), "TypeError: bad input");
  });

  it("includes the error code when there is one", () => {
    const err = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    assert.equal(describeError(err), "Error: ECONNREFUSED: connect failed");
  });

  // pg reports an unreachable database as an AggregateError with an empty message
  it("unpacks the errors inside an AggregateError", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), {
      code: "ECONNREFUSED",
    });
    const err = new AggregateError([refused, new Error("timed out")], "");

    assert.equal(
      describeError(err),
      "AggregateError: Error: ECONNREFUSED: connect ECONNREFUSED ::1:5432; Error: timed out",
    );
  });
});

describe("mapSettled", () => {
  it("returns one settled result per item, in input order", async () => {
    const results = await mapSettled([1, 2, 3], 2, async (n) => n * 10);

    assert.deepEqual(results, [
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 30 },
    ]);
  });

  it("keeps the input order when later items finish first", async () => {
    const results = await mapSettled([1, 2, 3, 4], 4, async (n) => {
      for (let i = 0; i < 5 - n; i++) await Promise.resolve(); // item 1 is slowest
      return n;
    });

    assert.deepEqual(
      results.map((r) => r.status === "fulfilled" && r.value),
      [1, 2, 3, 4],
    );
  });

  it("runs at most `limit` calls at once, and does reach the limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapSettled(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
    });

    assert.equal(peak, 4);
  });

  it("reports a rejection in place and carries on with the rest", async () => {
    const boom = new Error("boom");

    const results = await mapSettled(["a", "b", "c"], 2, async (item) => {
      if (item === "b") throw boom;
      return item;
    });

    assert.deepEqual(results[0], { status: "fulfilled", value: "a" });
    assert.deepEqual(results[1], { status: "rejected", reason: boom });
    assert.deepEqual(results[2], { status: "fulfilled", value: "c" });
  });

  it("passes the index along, and copes with empty input or a limit above the item count", async () => {
    assert.deepEqual(await mapSettled([], 5, async () => 1), []);

    const results = await mapSettled(["x", "y"], 50, async (item, index) => `${item}${index}`);
    assert.deepEqual(
      results.map((r) => r.status === "fulfilled" && r.value),
      ["x0", "y1"],
    );
  });
});

describe("toText", () => {
  it("strips tags and decodes HTML entities", () => {
    assert.equal(toText("<span>Why does &lt;div&gt; &amp; CSS break?</span>"), "Why does <div> & CSS break?");
  });

  it("collapses whitespace and line breaks into single spaces", () => {
    assert.equal(toText("<p>Hello</p>\n\n<p>big   world</p>"), "Hello big world");
  });

  it("returns an empty string for markup with no text", () => {
    assert.equal(toText("<p>  </p><br>"), "");
    assert.equal(toText(""), "");
  });
});

describe("toPreview", () => {
  it("returns short text unchanged, without markup", () => {
    assert.equal(toPreview("<p>Hello <span>world</span></p>"), "Hello world");
  });

  it("keeps exactly 200 characters whole", () => {
    const text = "x".repeat(200);
    assert.equal(toPreview(text), text);
  });

  it("cuts anything longer to 200 characters including the ellipsis", () => {
    const preview = toPreview("x".repeat(201));
    assert.equal(preview?.length, 200);
    assert.equal(preview, `${"x".repeat(199)}…`);
  });

  it("drops a trailing space before the ellipsis", () => {
    const preview = toPreview(`${"x".repeat(198)} ${"y".repeat(10)}`);
    assert.equal(preview, `${"x".repeat(198)}…`);
  });

  it("returns null when there is no text", () => {
    assert.equal(toPreview(""), null);
    assert.equal(toPreview("   \n "), null);
    assert.equal(toPreview("<p>  </p>"), null);
  });
});

describe("GITHUB_TOPICS", () => {
  it("covers every canonical tag, or says why it is skipped", () => {
    const queried = GITHUB_TOPICS.map((t) => t.tag);

    assert.deepEqual([...queried, ...SKIPPED_TAGS].sort(), [...CANONICAL].sort());
    assert.deepEqual(SKIPPED_TAGS, ["career", "opensource"]);
    assert.equal(queried.length, 38);
  });

  // The search finds repos by their GitHub topic; the topic has to mean the tag it stands for,
  // or the repos found would be filed under the wrong name.
  it("uses a topic that normalizes back to its own tag", () => {
    for (const { tag, topic } of GITHUB_TOPICS) {
      assert.deepEqual(normalizeTags([topic]), [tag], `topic "${topic}" for tag "${tag}"`);
    }
  });

  it("spells the topics GitHub spells differently from our tags", () => {
    const topicOf = (tag: string) => GITHUB_TOPICS.find((t) => t.tag === tag)?.topic;

    assert.equal(topicOf("go"), "golang");
    assert.equal(topicOf("machinelearning"), "machine-learning");
    assert.equal(topicOf("node"), "nodejs");
    assert.equal(topicOf("rust"), "rust");
  });

  it("has no duplicate topics", () => {
    const topics = GITHUB_TOPICS.map((t) => t.topic);
    assert.equal(new Set(topics).size, topics.length);
  });
});

describe("searchQuery", () => {
  const NOW = new Date("2026-11-18T10:00:00Z");

  it("asks for popular, non-fork, non-archived repos created in the last 7 days", () => {
    assert.equal(
      searchQuery("rust", NOW),
      "topic:rust created:>=2026-11-11 stars:>=20 forks:>=3 fork:false archived:false",
    );
  });

  it("counts the 7 days back in UTC, whatever the local offset of `now`", () => {
    // 00:30 on the 18th in Helsinki is still the 17th in UTC
    assert.match(searchQuery("rust", new Date("2026-11-18T00:30:00+02:00")), /created:>=2026-11-10 /);
  });

  it("crosses month and year boundaries", () => {
    assert.match(searchQuery("rust", new Date("2027-01-03T12:00:00Z")), /created:>=2026-12-27 /);
  });

  it("keeps a hyphenated topic as it is", () => {
    assert.match(searchQuery("machine-learning", NOW), /^topic:machine-learning /);
  });
});

describe("isOrganic", () => {
  const repo = (stargazers_count: number, forks_count: number) => ({ stargazers_count, forks_count });

  it("accepts a repo whose forks are a normal share of its stars", () => {
    assert.equal(isOrganic(repo(3044, 245)), true); // ~0.08
    assert.equal(isOrganic(repo(262, 18)), true); // ~0.07
    assert.equal(isOrganic(repo(54, 6)), true); // ~0.11
  });

  // Topic-stuffed repos seen in the python topic: hundreds of stars, almost no forks.
  it("rejects many stars with next to no forks", () => {
    assert.equal(isOrganic(repo(363, 0)), false);
    assert.equal(isOrganic(repo(363, 1)), false);
    assert.equal(isOrganic(repo(132, 0)), false);
  });

  it("rejects a repo with more forks than a real audience explains", () => {
    assert.equal(isOrganic(repo(100, 82)), false);
    assert.equal(isOrganic(repo(100, 120)), false);
  });

  it("includes both ends of the 0.02 to 0.5 band", () => {
    assert.equal(isOrganic(repo(100, 2)), true);
    assert.equal(isOrganic(repo(100, 50)), true);
    assert.equal(isOrganic(repo(100, 1)), false);
    assert.equal(isOrganic(repo(100, 51)), false);
  });

  it("rejects a repo with no stars instead of dividing by zero", () => {
    assert.equal(isOrganic(repo(0, 0)), false);
    assert.equal(isOrganic(repo(0, 5)), false);
  });
});

describe("repoTags", () => {
  it("maps the topics and the language to canonical tags", () => {
    assert.deepEqual(
      repoTags({ topics: ["machine-learning", "pytorch", "python"], language: "Python" }, "python"),
      ["machinelearning", "python"],
    );
  });

  it("turns the language C# into csharp, and drops languages that are not tags", () => {
    assert.deepEqual(repoTags({ topics: [], language: "C#" }, "dotnet"), ["csharp", "dotnet"]);
    assert.deepEqual(repoTags({ topics: ["rust"], language: "Jupyter Notebook" }, "rust"), ["rust"]);
    assert.deepEqual(repoTags({ topics: ["rust"], language: "C++" }, "rust"), ["rust"]);
  });

  it("always includes the tag the repo was found under", () => {
    assert.deepEqual(repoTags({ topics: ["rust-lang"], language: null }, "rust"), ["rust"]);
    assert.deepEqual(repoTags({ topics: [], language: undefined }, "docker"), ["docker"]);
  });

  it("lists each tag once, in the order topics, language, then the search tag", () => {
    assert.deepEqual(
      repoTags({ topics: ["typescript", "react", "ts", "reactjs"], language: "TypeScript" }, "react"),
      ["typescript", "react"],
    );
    assert.deepEqual(repoTags({ topics: ["docker"], language: "Go" }, "kubernetes"), [
      "docker",
      "go",
      "kubernetes",
    ]);
  });
});

// Timing checks. These guard against an order-of-magnitude slowdown (a regex rebuilt on
// every call, accidental quadratic work), not for benchmarking. Each budget is roughly
// 10x the median measured on a development machine, so a slow or busy CI runner is
// still comfortably inside it. See medianMs() in testing.ts for how a run is timed.
describe("performance (loose budgets)", () => {
  // Measured medians (Windows dev machine, Node 25) next to each budget. If a check starts
  // failing, first rule out a noisy machine by re-running; then look for the slow code.
  const BUDGET_MS = {
    inferTagsManyTitles: 75, // measured ~7 ms
    inferTagsHugeTitle: 75, // measured ~6 ms
    normalizeTagsManyLists: 100, // measured ~9 ms
    toPreviewLargeHtml: 125, // measured ~10 ms
    isOrganicManyRepos: 15, // measured ~1.5 ms
    repoTagsManyRepos: 130, // measured ~13 ms
  };

  const within = (label: string, ms: number, budget: number) =>
    assert.ok(ms < budget, `${label} took ${ms.toFixed(1)} ms, budget is ${budget} ms`);

  const SAMPLE_TITLES = [
    "Show HN: I built a Rust-based tool for parsing logs",
    "Why Go is not enough for our backend",
    "PostgreSQL 18 released with major performance gains",
    "Running an LLM on a laptop: what I learned",
    "The history of salt",
    "Node.js 24 and the new permission model",
    "A practical guide to open source licensing",
    "Swift 6 concurrency, explained",
    "How we cut our AWS bill by 60% with Kubernetes autoscaling",
    "Machine learning for people who hate math",
    "Ask HN: What are you working on this week?",
    "C++ and C# interop without tears",
  ];

  it("infers tags for 5,000 titles quickly", () => {
    const titles = Array.from(
      { length: 5_000 },
      (_, i) => `${SAMPLE_TITLES[i % SAMPLE_TITLES.length]} (${i})`,
    );

    const ms = medianMs(() => {
      for (const title of titles) inferTags(title);
    });

    within("inferTags x 5,000 titles", ms, BUDGET_MS.inferTagsManyTitles);
  });

  it("infers tags from very long titles in linear time", () => {
    const hugeInputs = [
      "a".repeat(100_000), // one enormous word
      "Go ".repeat(16_000), // many repeated tokens
      "Rust and Python, ".repeat(3_000), // many hits
      "a.b-c+d#e ".repeat(5_000), // separators everywhere
    ];

    const ms = medianMs(() => {
      for (const input of hugeInputs) inferTags(input);
    });

    within("inferTags x 4 huge titles", ms, BUDGET_MS.inferTagsHugeTitle);
  });

  it("normalises 5,000 tag lists quickly", () => {
    const raw = [
      "javascript", "Node.js", "react", "beginners", "tutorial", "webdev", "k8s", "llm",
      "Machine-Learning", "c#", "postgres", "docker", "python", "tdd", "opensource",
      "career", "devops", "random-tag", "another", "last-one",
    ];

    const ms = medianMs(() => {
      for (let i = 0; i < 5_000; i++) normalizeTags(raw);
    });

    within("normalizeTags x 5,000 lists", ms, BUDGET_MS.normalizeTagsManyLists);
  });

  // Stack Overflow questions are fetched with filter=withbody, so bodies can be large.
  it("makes a preview from a 100 KB HTML body quickly", () => {
    const html = '<p>Some <code>code</code> and <span>text</span> in a question body.</p>\n'.repeat(1_500);
    assert.ok(html.length > 100_000);

    const ms = medianMs(() => toPreview(html), 3);

    within("toPreview x 100 KB HTML", ms, BUDGET_MS.toPreviewLargeHtml);
  });

  it("judges 200,000 repos quickly", () => {
    const repos = Array.from({ length: 200_000 }, (_, i) => ({
      stargazers_count: 20 + (i % 500),
      forks_count: i % 40,
    }));

    const ms = medianMs(() => {
      for (const repo of repos) isOrganic(repo);
    });

    within("isOrganic x 200,000 repos", ms, BUDGET_MS.isOrganicManyRepos);
  });

  // A repo can list up to 20 topics on GitHub.
  it("derives the tags of 5,000 repos quickly", () => {
    const topics = [
      "rust", "cli", "machine-learning", "python", "docker", "kubernetes", "awesome", "tool",
      "self-hosted", "react", "typescript", "nodejs", "api", "llm", "devops", "security",
      "golang", "linux", "tutorial", "web",
    ];
    const repo = { topics, language: "TypeScript" };

    const ms = medianMs(() => {
      for (let i = 0; i < 5_000; i++) repoTags(repo, "rust");
    });

    within("repoTags x 5,000 repos", ms, BUDGET_MS.repoTagsManyRepos);
  });
});
