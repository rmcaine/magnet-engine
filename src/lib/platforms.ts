/**
 * The "here's what I looked at" line. Built from what the engine actually
 * read, never by the AI, so it is always true.
 */
import type { Evidence, PlatformRead } from "./sources/types";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What one reader's evidence covered, or null when it found nothing to show. */
export function describeRead(evidence: Evidence): PlatformRead | null {
  if (evidence.blocks.length === 0 && evidence.facts.length === 0) return null;
  switch (evidence.source) {
    case "facebook": {
      const posts = evidence.blocks.reduce((sum, block) => sum + block.text.split("\n").filter((line) => line.startsWith("- ")).length, 0);
      return { platform: "Facebook", detail: count(posts, "public post", "public posts") };
    }
    case "linkedin": {
      const match = evidence.facts.map((fact) => fact.match(/^Recent public posts found: (\d+)$/)).find(Boolean);
      const posts = match ? Number(match[1]) : 0;
      return { platform: "LinkedIn", detail: posts > 0 ? `profile and ${count(posts, "post", "posts")}` : "profile" };
    }
    case "website":
      return { platform: "Website", detail: count(evidence.blocks.length, "page", "pages") };
    case "youtube":
      return { platform: "YouTube", detail: "channel and recent videos" };
    case "instagram":
      return { platform: "Instagram", detail: "profile and recent posts" };
  }
}

export function formatPlatformsLine(lead: string, list: PlatformRead[]): string | null {
  if (list.length === 0) return null;
  const parts = list.map((item) => `your ${item.platform === "Website" ? "website" : item.platform} (${item.detail})`);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${lead} ${joined}.`;
}
