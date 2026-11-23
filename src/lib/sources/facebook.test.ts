import { beforeEach, describe, expect, it, vi } from "vitest";

const runActor = vi.fn();
vi.mock("./apify", async (importOriginal) => ({ ...(await importOriginal<typeof import("./apify")>()), runActor }));

const { readFacebook } = await import("./facebook");

describe("readFacebook", () => {
  beforeEach(() => runActor.mockReset());

  it("asks Apify for that one profile and the post limit", async () => {
    runActor.mockResolvedValue({ runId: "r1", actor: "a", items: [{ text: "A real post about my shop.", time: "2026-11-20T15:00:00Z" }] });
    const evidence = await readFacebook("https://www.facebook.com/someone", 20);
    expect(runActor).toHaveBeenCalledWith("apify~facebook-posts-scraper", { startUrls: [{ url: "https://www.facebook.com/someone" }], resultsLimit: 20, captionText: false });
    expect(evidence.source).toBe("facebook");
    expect(evidence.apifyRunIds).toEqual(["r1"]);
    expect(evidence.facts).toContain("Public Facebook posts read: 1");
  });

  it("fails with no_public_posts when nothing has text (friends-only or photo-only)", async () => {
    runActor.mockResolvedValue({ runId: "r2", actor: "a", items: [{ text: "", likes: 3 }, { media: [{}] }] });
    await expect(readFacebook("https://www.facebook.com/someone", 20)).rejects.toMatchObject({ code: "no_public_posts" });
  });

  it("fails with no_public_posts when Apify returns nothing (friends-only or wrong name)", async () => {
    runActor.mockResolvedValue({ runId: "r3", actor: "a", items: [] });
    await expect(readFacebook("https://www.facebook.com/someone", 20)).rejects.toMatchObject({ code: "no_public_posts" });
  });
});
