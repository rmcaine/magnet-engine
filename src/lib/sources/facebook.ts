/**
 * Reads the public posts on a Facebook profile or Page through Apify's own
 * `apify~facebook-posts-scraper` (about $5 per 1,000 posts, no login or
 * cookies). Only posts set to Public come back; friends-only profiles return
 * nothing. Tested 2026-11-23 on three personal profiles: 20 posts each, text
 * matched the posts exactly. Thread posts return only their opening line, and
 * photo-only posts have no text.
 *
 * The tool returns posts, not the profile's own links, so nothing here is
 * followed. Links inside posts are often other people's affiliate links.
 */
import { runActor, SourceError } from "./apify";
import { emptyEvidence, gradeStrength, obj, shortDate, str, type Evidence } from "./types";

const ACTOR = "apify~facebook-posts-scraper";

export function summarizeFacebookPosts(items: unknown[]): { name: string | null; lines: string[] } {
  let name: string | null = null;
  const lines: string[] = [];
  for (const raw of items) {
    const item = obj(raw);
    if (!item) continue;
    name ??= str(obj(item.user)?.name) ?? str(item.pageName) ?? str(item.authorName);
    const text = str(item.text) ?? str(item.postText);
    if (!text) continue;
    const date = shortDate(str(item.time) ?? str(item.timestamp) ?? str(item.date));
    const counts = [typeof item.likes === "number" ? `${item.likes} reactions` : null, typeof item.comments === "number" ? `${item.comments} comments` : null].filter(Boolean);
    lines.push(`- ${[date ?? "undated", ...counts].join(", ")}: ${text.replace(/\s+/g, " ").slice(0, 700)}`);
  }
  return { name, lines };
}

export async function readFacebook(profileUrl: string, maxPosts: number): Promise<Evidence> {
  const evidence = emptyEvidence("facebook", profileUrl);
  const run = await runActor(ACTOR, { startUrls: [{ url: profileUrl }], resultsLimit: maxPosts, captionText: false });
  evidence.apifyRunIds.push(run.runId);
  // Facebook returns nothing for a friends-only profile (and for a wrong name); both get the same plain message.
  if (run.items.length === 0) throw new SourceError("no_public_posts");
  const { name, lines } = summarizeFacebookPosts(run.items);
  if (lines.length === 0) throw new SourceError("no_public_posts");
  evidence.subject.name = name;
  evidence.facts.push(`Public Facebook posts read: ${lines.length}`);
  evidence.blocks.push({ label: "Recent public Facebook posts, newest first", text: lines.join("\n") });
  evidence.strength = gradeStrength(evidence);
  return evidence;
}
