// All the pure utility functions in one fast file: `npm run test:utils`.
// Rules for this file: no fetch stubs, no fake timers, no I/O, so it runs in a
// few milliseconds. Tests that need those (getJson, the adapters) live elsewhere.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError } from "./logger.ts";
import { inferTags, normalizeTags } from "./tags.ts";
import { medianMs } from "./testing.ts";
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
    assert.deepEqual(normalizeTags(["beginners", "tutorial", "python", "c#"]), ["python"]);
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
    assert.deepEqual(inferTags("C++ and C#"), []);
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
});
