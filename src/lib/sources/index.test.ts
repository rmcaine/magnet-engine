import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSettings, type Settings } from "../settings";
import { SourceError } from "./apify";
import { emptyEvidence, type Evidence } from "./types";

const readWebsite = vi.fn();
const readLinkedIn = vi.fn();
const readFacebook = vi.fn();
const readInstagram = vi.fn();
const readYouTube = vi.fn();
vi.mock("./website", () => ({ readWebsite: (...a: unknown[]) => readWebsite(...a) }));
vi.mock("./linkedin", () => ({ readLinkedIn: (...a: unknown[]) => readLinkedIn(...a) }));
vi.mock("./facebook", () => ({ readFacebook: (...a: unknown[]) => readFacebook(...a) }));
vi.mock("./instagram", () => ({ readInstagram: (...a: unknown[]) => readInstagram(...a) }));
vi.mock("./youtube", () => ({ readYouTube: (...a: unknown[]) => readYouTube(...a) }));

const { gatherEvidence } = await import("./index");

function settings(extra = ""): Settings {
  const yaml = readFileSync(path.join(__dirname, "../../../examples/second-act-map.yaml"), "utf8").replace("type: linkedin", `type: any${extra}`);
  const parsed = parseSettings(yaml);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.settings;
}

function ev(source: Evidence["source"], url: string, over: Partial<Evidence> = {}): Evidence {
  return { ...emptyEvidence(source, url), blocks: [{ label: "Main", text: "main text" }], ...over };
}

beforeEach(() => {
  for (const fn of [readWebsite, readLinkedIn, readFacebook, readInstagram, readYouTube]) fn.mockReset();
  readLinkedIn.mockImplementation(async (url: string) => ev("linkedin", url, { facts: ["Name: Jane"], blocks: [{ label: "About section", text: "about" }], apifyRunIds: ["li"] }));
  readFacebook.mockImplementation(async (url: string) => ev("facebook", url, { facts: ["Public Facebook posts read: 4"], blocks: [{ label: "Recent public Facebook posts, newest first", text: "posts" }], apifyRunIds: ["fb"] }));
});

describe("gatherEvidence follows", () => {
  it("website start follows linked LinkedIn and Facebook", async () => {
    readWebsite.mockResolvedValue(ev("website", "https://jane.com", { linkedChannels: ["https://linkedin.com/in/jane-doe", "https://facebook.com/jane.doe"] }));
    const out = await gatherEvidence(settings(), "website", "https://jane.com");
    expect(readLinkedIn).toHaveBeenCalledWith("https://www.linkedin.com/in/jane-doe", 5);
    expect(readFacebook).toHaveBeenCalledWith("https://www.facebook.com/jane.doe", 10);
    const labels = out.blocks.map((b) => b.label);
    expect(labels.some((l) => l.startsWith("Their LinkedIn"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Their Facebook"))).toBe(true);
    expect(out.facts).toContain("Their LinkedIn: Name: Jane");
    expect(out.apifyRunIds).toEqual(expect.arrayContaining(["li", "fb"]));
  });

  it("never re-reads the start", async () => {
    readLinkedIn.mockResolvedValueOnce(ev("linkedin", "https://www.linkedin.com/in/same", { linkedChannels: ["https://linkedin.com/in/same"] }));
    await gatherEvidence(settings(), "linkedin", "https://www.linkedin.com/in/same");
    expect(readLinkedIn).toHaveBeenCalledTimes(1);
  });

  it("flags off skip follows but still name the links", async () => {
    readWebsite.mockResolvedValue(ev("website", "https://jane.com", { linkedChannels: ["https://linkedin.com/in/jane-doe", "https://facebook.com/jane.doe"] }));
    const out = await gatherEvidence(settings("\n  alsoReadLinkedIn: false\n  alsoReadFacebook: false"), "website", "https://jane.com");
    expect(readLinkedIn).not.toHaveBeenCalled();
    expect(readFacebook).not.toHaveBeenCalled();
    const named = out.facts.find((f) => f.startsWith("Other public profiles they link to"));
    expect(named).toContain("linkedin.com/in/jane-doe");
    expect(named).toContain("facebook.com/jane.doe");
  });

  it("a failed follow doesn't fail the report", async () => {
    readWebsite.mockResolvedValue(ev("website", "https://jane.com", { linkedChannels: ["https://facebook.com/jane.doe"] }));
    readFacebook.mockRejectedValue(new SourceError("apify_out_of_credit"));
    const out = await gatherEvidence(settings(), "website", "https://jane.com");
    expect(out.blocks[0].text).toBe("main text");
    expect(out.facts.find((f) => f.startsWith("Other public profiles"))).toContain("facebook.com/jane.doe");
  });

  it("company pages aren't followed", async () => {
    readWebsite.mockResolvedValue(ev("website", "https://jane.com", { linkedChannels: ["https://linkedin.com/company/acme"] }));
    const out = await gatherEvidence(settings(), "website", "https://jane.com");
    expect(readLinkedIn).not.toHaveBeenCalled();
    expect(out.facts.find((f) => f.startsWith("Other public profiles"))).toContain("linkedin.com/company/acme");
  });
});
