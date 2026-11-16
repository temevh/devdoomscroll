import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTags } from "./tags.ts";

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
});
