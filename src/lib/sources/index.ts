import type { Settings, SourceType } from "../settings";
import { normalizeFacebook, normalizeInstagram, normalizeLinkedIn, normalizeWebsite, normalizeYouTube } from "../source-urls";
import { readFacebook } from "./facebook";
import { readInstagram } from "./instagram";
import { readLinkedIn } from "./linkedin";
import { describeRead } from "../platforms";
import type { Evidence, PlatformRead } from "./types";
import { gradeStrength } from "./types";
import { readWebsite } from "./website";
import { readYouTube } from "./youtube";

/** Things the owner already knows about the prospect, so the engine doesn't have to find them. */
export interface EvidenceHints {
  website?: string | null;
  youtube?: string | null;
}

function tryNormalize(fn: (raw: string) => string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return fn(raw);
  } catch {
    return null;
  }
}

function pick(channels: string[], test: RegExp): string | null {
  return channels.find((c) => test.test(c)) ?? null;
}

/** The first link that the normalizer accepts, with its canonical form. */
function firstValid(channels: string[], fn: (raw: string) => string): { raw: string; url: string } | null {
  for (const raw of channels) {
    const url = tryNormalize(fn, raw);
    if (url) return { raw, url };
  }
  return null;
}

/** Text cut to whole lines under the limit, so no post is half-shown. */
function wholeLines(text: string, max: number): string {
  if (text.length <= max) return text;
  const out: string[] = [];
  let size = 0;
  for (const line of text.split("\n")) {
    if (size + line.length + 1 > max) break;
    out.push(line);
    size += line.length + 1;
  }
  return out.join("\n");
}

/**
 * Reads the main source, then follows what it links to: the website (free),
 * a YouTube channel (free), a public Instagram profile (under a cent), a
 * personal LinkedIn profile and a Facebook profile (a few cents each, public
 * only), and names any other channels it saw. It never searches: only links
 * found on the pages it read. The picture of what the prospect already
 * has online is what makes a report specific instead of generic.
 */
export async function gatherEvidence(settings: Settings, type: SourceType, url: string, hints: EvidenceHints = {}): Promise<Evidence> {
  const { alsoReadWebsite, linkedinPosts, facebookPosts } = settings.source;
  const evidence =
    type === "website"
      ? await readWebsite(url)
      : type === "linkedin"
        ? await readLinkedIn(url, linkedinPosts)
        : type === "youtube"
          ? await readYouTube(url)
          : type === "facebook"
            ? await readFacebook(url, facebookPosts)
            : await readInstagram(url);

  // What was actually read, in order, for the "here's what I looked at" line.
  const platforms: PlatformRead[] = [];
  const note = (read: Evidence) => {
    const item = describeRead(read);
    if (item) platforms.push(item);
  };
  note(evidence);

  const channels = new Set<string>(evidence.linkedChannels);

  // 1. The website: the one the owner typed, else the one the profile links. Free, plain fetch.
  const site = type === "website" ? null : tryNormalize(normalizeWebsite, hints.website) ?? (alsoReadWebsite ? tryNormalize(normalizeWebsite, evidence.linkedWebsite) : null);
  if (site) {
    try {
      const extra = await readWebsite(site);
      if (extra.blocks.length) {
        evidence.facts.push(...extra.facts.map((fact) => `Their website: ${fact}`));
        evidence.blocks.push(...extra.blocks.slice(0, 3).map((block) => ({ label: `Their website, ${block.label}`, text: block.text.slice(0, 3000) })));
        evidence.linkedWebsite = site;
        extra.linkedChannels.forEach((c) => channels.add(c));
        note({ ...extra, blocks: extra.blocks.slice(0, 3) });
      }
    } catch {
      // A site that won't load is not a reason to fail the report.
    }
  }

  // 2. A YouTube channel: typed, or linked from the profile or site. Free.
  const youtube = type === "youtube" ? null : tryNormalize(normalizeYouTube, hints.youtube) ?? tryNormalize(normalizeYouTube, pick([...channels], /youtube\.com\//i));
  if (youtube) {
    try {
      const yt = await readYouTube(youtube);
      if (yt.facts.length) {
        evidence.facts.push(...yt.facts.map((fact) => `Their YouTube channel: ${fact}`));
        evidence.blocks.push(...yt.blocks.slice(0, 2).map((block) => ({ label: `Their YouTube channel, ${block.label}`, text: block.text.slice(0, 3000) })));
        note(yt);
      }
    } catch {
      // Unreadable channel: the report simply says nothing about YouTube.
    }
  }

  // 3. A public Instagram profile linked from the profile or site. Apify, under a cent; private accounts come back empty.
  const instagram = type === "instagram" ? null : tryNormalize(normalizeInstagram, pick([...channels], /instagram\.com\//i));
  if (instagram) {
    try {
      const ig = await readInstagram(instagram);
      evidence.apifyRunIds.push(...ig.apifyRunIds);
      if (ig.facts.length) {
        evidence.facts.push(...ig.facts.map((fact) => `Their Instagram: ${fact}`));
        evidence.blocks.push(...ig.blocks.slice(0, 1).map((block) => ({ label: `Their Instagram, ${block.label}`, text: block.text.slice(0, 2000) })));
        note(ig);
      }
    } catch {
      // Same rule: a channel that can't be read is left out, never guessed at.
    }
  }

  // Links we read below, so they aren't also listed as "named, not read".
  const followed = new Set<string>();

  // Paid follows are on by default only in any-link mode, so magnets saved before this keep their cost.
  const followLinkedIn = settings.source.alsoReadLinkedIn ?? settings.source.type === "any";
  const followFacebook = settings.source.alsoReadFacebook ?? settings.source.type === "any";

  // 4. A personal LinkedIn profile they link to. Apify, a few cents; company pages are only named.
  const linkedinFound = followLinkedIn && type !== "linkedin" ? firstValid([...channels], normalizeLinkedIn) : null;
  if (linkedinFound && linkedinFound.url.toLowerCase() !== url.toLowerCase()) {
    const { raw: linkedinRaw, url: linkedin } = linkedinFound;
    try {
      const li = await readLinkedIn(linkedin, Math.min(linkedinPosts, 5));
      evidence.apifyRunIds.push(...li.apifyRunIds);
      if (li.facts.length || li.blocks.length) {
        evidence.facts.push(...li.facts.map((fact) => `Their LinkedIn: ${fact}`));
        // The About section plus the posts we paid for (Experience/Education/Skills sit between them).
        const kept = [li.blocks[0], li.blocks.find((block) => /posts/i.test(block.label))].filter((block, i, all): block is NonNullable<typeof block> => Boolean(block) && all.indexOf(block) === i);
        evidence.blocks.push(...kept.map((block) => ({ label: `Their LinkedIn, ${block.label}`, text: block.text.slice(0, 3000) })));
        followed.add(linkedinRaw);
        note(li);
      }
    } catch {
      // A profile that can't be read is named below instead, never guessed at.
    }
  }

  // 5. A Facebook profile or Page they link to. Apify, public posts only.
  // The first link that is really a profile: websites also carry pixel and share-button links.
  const facebookFound = followFacebook && type !== "facebook" ? firstValid([...channels], normalizeFacebook) : null;
  if (facebookFound && facebookFound.url.toLowerCase() !== url.toLowerCase()) {
    const { raw: facebookRaw, url: facebook } = facebookFound;
    try {
      const fb = await readFacebook(facebook, Math.min(facebookPosts, 10));
      evidence.apifyRunIds.push(...fb.apifyRunIds);
      // Keep whole posts only, so the platforms line counts exactly what the AI sees.
      const shown = fb.blocks.slice(0, 1).map((block) => ({ label: block.label, text: wholeLines(block.text, 3000) }));
      fb.blocks = shown;
      evidence.facts.push(...fb.facts.filter((fact) => !/^Public Facebook posts read:/.test(fact)).map((fact) => `Their Facebook: ${fact}`));
      evidence.blocks.push(...shown.map((block) => ({ label: `Their Facebook, ${block.label}`, text: block.text })));
      followed.add(facebookRaw);
      note(fb);
    } catch {
      // Friends-only or unreadable: named below instead.
    }
  }

  // 6. Anything else they link (TikTok, X, a LinkedIn company page, a profile we couldn't read): named, not read.
  const others = [...channels].filter((c) => !/youtube\.com|instagram\.com/i.test(c) && !followed.has(c) && c.toLowerCase() !== url.toLowerCase()).slice(0, 6);
  if (others.length) evidence.facts.push(`Other public profiles they link to: ${others.join(", ")}`);
  evidence.linkedChannels = [...channels];

  evidence.platformsRead = platforms;
  if (platforms.length) evidence.facts.push(`Platforms read for this report: ${platforms.map((p) => p.platform).join(", ")} (${platforms.length})`);
  // We only follow posted links, so one platform may mean others exist but aren't linked.
  if (platforms.length === 1) evidence.facts.push("Only one platform was found linked. They may be on others that aren't linked from this profile.");

  evidence.strength = gradeStrength(evidence);
  return evidence;
}

export function evidenceForPrompt(evidence: Evidence): string {
  return [
    `Source: ${evidence.source} (${evidence.url})`,
    ...evidence.facts.map((fact) => `- ${fact}`),
    "",
    ...evidence.blocks.map((block) => `### ${block.label}\n${block.text}`),
  ].join("\n");
}
