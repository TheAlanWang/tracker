import { describe, expect, it } from "vitest";

import { rebaseDraft } from "./rebaseDraft";

describe("rebaseDraft", () => {
  it("an untouched draft follows the server; an edited one is kept", () => {
    expect(rebaseDraft("todo", "todo", "done")).toBe("done");
    expect(rebaseDraft("in_review", "todo", "done")).toBe("in_review");
    expect(rebaseDraft(null, null, "u1")).toBe("u1");
  });
});
