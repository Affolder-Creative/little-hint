import { describe, it, expect } from "vitest";
import { moveMentions } from "../src/client/mention-state";
describe("mention edits", () => {
  it("shifts selected mentions after inserted text using browser UTF-16 positions", () => {
    expect(
      moveMentions("@Sam hi", "🎁 @Sam hi", [
        { userId: "sam", start: 0, end: 4 },
      ]),
    ).toEqual([{ userId: "sam", start: 3, end: 7 }]);
  });
  it("drops an edited name instead of silently notifying the former selection", () => {
    expect(
      moveMentions("Hi @Sam", "Hi @Sally", [
        { userId: "sam", start: 3, end: 7 },
      ]),
    ).toEqual([]);
  });
  it("preserves unaffected mentions when another is removed", () => {
    expect(
      moveMentions("@Sam and @Alex", "and @Alex", [
        { userId: "sam", start: 0, end: 4 },
        { userId: "alex", start: 9, end: 14 },
      ]),
    ).toEqual([{ userId: "alex", start: 4, end: 9 }]);
  });
});
