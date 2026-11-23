import { describe, expect, it } from "vitest";
import { ownerErrorMessage, publicErrorMessage } from "./reports";

describe("no_public_posts messages", () => {
  it("tells the prospect what to paste instead", () => {
    expect(publicErrorMessage("no_public_posts")).toBe("We couldn't see any public posts on that profile. If your posts are set to Friends, paste your website or LinkedIn link instead.");
  });
  it("tells the owner the posts aren't public", () => {
    expect(ownerErrorMessage("no_public_posts")).toMatch(/no public posts/i);
  });
});
