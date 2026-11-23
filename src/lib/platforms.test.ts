import { describe, expect, it } from "vitest";
import { describeRead, formatPlatformsLine } from "./platforms";
import { emptyEvidence } from "./sources/types";

describe("formatPlatformsLine", () => {
  it("lists every platform read, in order", () => {
    expect(
      formatPlatformsLine("Here's what I looked at:", [
        { platform: "Facebook", detail: "18 public posts" },
        { platform: "Website", detail: "3 pages" },
        { platform: "LinkedIn", detail: "profile and 5 posts" },
      ]),
    ).toBe("Here's what I looked at: your Facebook (18 public posts), your website (3 pages) and your LinkedIn (profile and 5 posts).");
  });
  it("handles one platform", () => {
    expect(formatPlatformsLine("Here's what I looked at:", [{ platform: "Facebook", detail: "20 public posts" }])).toBe("Here's what I looked at: your Facebook (20 public posts).");
  });
  it("returns null when nothing was read", () => {
    expect(formatPlatformsLine("x", [])).toBeNull();
  });
});

describe("describeRead", () => {
  it("counts Facebook posts from the posts block", () => {
    const e = { ...emptyEvidence("facebook", "u"), blocks: [{ label: "Recent public Facebook posts, newest first", text: "- a\n- b\n- c" }] };
    expect(describeRead(e)).toEqual({ platform: "Facebook", detail: "3 public posts" });
  });
  it("uses singular for one", () => {
    const e = { ...emptyEvidence("facebook", "u"), blocks: [{ label: "x", text: "- a" }] };
    expect(describeRead(e)).toEqual({ platform: "Facebook", detail: "1 public post" });
  });
  it("describes LinkedIn from its posts fact", () => {
    const e = { ...emptyEvidence("linkedin", "u"), facts: ["Name: J", "Recent public posts found: 5"] };
    expect(describeRead(e)).toEqual({ platform: "LinkedIn", detail: "profile and 5 posts" });
  });
  it("counts website pages", () => {
    const e = { ...emptyEvidence("website", "u"), blocks: [{ label: "Home", text: "a" }, { label: "About", text: "b" }] };
    expect(describeRead(e)).toEqual({ platform: "Website", detail: "2 pages" });
  });
  it("returns null when a reader found nothing", () => {
    expect(describeRead(emptyEvidence("website", "u"))).toBeNull();
  });
});
