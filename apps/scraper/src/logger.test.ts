import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError } from "./logger.ts";

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
