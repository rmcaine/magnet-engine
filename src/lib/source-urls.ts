/**
 * Turns whatever a prospect pastes into one canonical URL for the configured
 * source, or throws an Error whose message is safe to show them. Used by the
 * browser (instant feedback) and the server (the real check). No Node APIs.
 */
import type { SettingsSourceType, SourceType } from "./settings";

const PROMPTS: Record<SettingsSourceType, string> = {
  any: "Enter a link to your website, Facebook, LinkedIn, YouTube or Instagram profile.",
  facebook: "Enter a Facebook profile link, such as facebook.com/yourname.",
  website: "Enter a website address, such as yourbusiness.com.",
  linkedin: "Enter a LinkedIn profile link, such as linkedin.com/in/yourname.",
  youtube: "Enter a YouTube channel link, such as youtube.com/@yourchannel.",
  instagram: "Enter an Instagram profile, such as instagram.com/yourname or @yourname.",
};

export function sourceExample(type: SettingsSourceType): string {
  return PROMPTS[type];
}

function toUrl(raw: string, type: SettingsSourceType): URL {
  const value = raw.trim();
  if (!value) throw new Error(PROMPTS[type]);
  if (value.length > 500) throw new Error("That link is too long. " + PROMPTS[type]);
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error(PROMPTS[type]);
  }
}

function assertPlainWeb(url: URL, type: SettingsSourceType): void {
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error(PROMPTS[type]);
  }
}

export function normalizeSourceUrl(type: SettingsSourceType, raw: string): string {
  return resolveSource(type, raw).url;
}

/** The kind of link and its canonical URL. A fixed type checks the link against that kind; "any" detects it. */
export function resolveSource(type: SettingsSourceType, raw: string): { type: SourceType; url: string } {
  switch (type) {
    case "any":
      return detectSource(raw);
    case "website":
      return { type, url: normalizeWebsite(raw) };
    case "linkedin":
      return { type, url: normalizeLinkedIn(raw) };
    case "youtube":
      return { type, url: normalizeYouTube(raw) };
    case "instagram":
      return { type, url: normalizeInstagram(raw) };
    case "facebook":
      return { type, url: normalizeFacebook(raw) };
  }
}

/** Works out which site a pasted link belongs to, then checks it with that site's rules. */
export function detectSource(raw: string): { type: SourceType; url: string } {
  const value = raw.trim();
  // A bare handle could live on any site, so ask for the whole link.
  if ((value.startsWith("@") && !value.includes("/")) || (/^[\w.]+$/.test(value) && !/\.[a-z]{2,}$/i.test(value))) {
    throw new Error("Paste the full link to your profile, such as facebook.com/yourname or linkedin.com/in/yourname.");
  }
  const host = toUrl(value, "any").hostname.toLowerCase().replace(/\.$/, "");
  if (FACEBOOK_HOSTS.has(host)) return { type: "facebook", url: normalizeFacebook(value) };
  if (/(^|\.)linkedin\.com$/.test(host)) return { type: "linkedin", url: normalizeLinkedIn(value) };
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return { type: "youtube", url: normalizeYouTube(value) };
  if (/(^|\.)instagram\.com$/.test(host)) return { type: "instagram", url: normalizeInstagram(value) };
  return { type: "website", url: normalizeWebsite(value) };
}

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "www.fb.com"]);
// Also covers links websites carry that aren't anyone's profile: the Meta Pixel (tr), share buttons and plugins.
const FACEBOOK_RESERVED = new Set(["share", "sharer", "plugins", "dialog", "tr", "groups", "events", "reel", "reels", "watch", "photo", "photos", "posts", "marketplace", "gaming", "pages", "hashtag", "login"]);
const FACEBOOK_NOT_PROFILE = "That's a post, group or share link. Paste the profile link instead, such as facebook.com/yourname.";

export function normalizeFacebook(raw: string): string {
  const url = toUrl(raw, "facebook");
  assertPlainWeb(url, "facebook");
  if (!FACEBOOK_HOSTS.has(url.hostname.toLowerCase())) throw new Error(PROMPTS.facebook);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error(PROMPTS.facebook);
  if (parts[0].toLowerCase() === "profile.php") {
    const id = url.searchParams.get("id");
    if (!id || !/^\d{5,20}$/.test(id)) throw new Error(PROMPTS.facebook);
    return `https://www.facebook.com/profile.php?id=${id}`;
  }
  // photo.php, video.php, sharer.php, home.php…: only profile.php is a profile.
  if (FACEBOOK_RESERVED.has(parts[0].toLowerCase()) || /\.php$/i.test(parts[0]) || parts.length > 1) throw new Error(FACEBOOK_NOT_PROFILE);
  // Facebook usernames are at least 5 characters, which also rules out junk like /2008 from page markup.
  if (!/^[A-Za-z0-9.]{5,80}$/.test(parts[0])) throw new Error(PROMPTS.facebook);
  return `https://www.facebook.com/${parts[0]}`;
}

const BLOCKED_SITE_HOSTS = /(^|\.)(linkedin\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com)$/i;

export function normalizeWebsite(raw: string): string {
  const url = toUrl(raw, "website");
  assertPlainWeb(url, "website");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // IP literals, localhost and single-label names are never a business website.
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[") || /(^|\.)localhost$/.test(host) || /\.(local|internal|lan|home|corp)$/.test(host)) {
    throw new Error(PROMPTS.website);
  }
  if (BLOCKED_SITE_HOSTS.test(host)) {
    throw new Error("That's a social profile, not a website. Enter the business website, such as yourbusiness.com.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${path}`;
}

export function normalizeLinkedIn(raw: string): string {
  const url = toUrl(raw, "linkedin");
  assertPlainWeb(url, "linkedin");
  const host = url.hostname.toLowerCase();
  const hostOk = host === "linkedin.com" || host === "www.linkedin.com" || /^[a-z]{2}\.linkedin\.com$/.test(host);
  const match = url.pathname.match(/^\/in\/([a-z0-9_%~.-]{2,100})\/?$/i);
  if (!hostOk || !match) {
    if (hostOk && /^\/company\//i.test(url.pathname)) {
      throw new Error("That's a company page. This report reads personal profiles, such as linkedin.com/in/yourname.");
    }
    throw new Error(PROMPTS.linkedin);
  }
  return `https://www.linkedin.com/in/${match[1]}`;
}

export function normalizeYouTube(raw: string): string {
  const url = toUrl(raw.trim().replace(/^@/, "youtube.com/@"), "youtube");
  assertPlainWeb(url, "youtube");
  const host = url.hostname.toLowerCase();
  if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (host === "youtu.be") throw new Error("That's a video link. Paste the channel link instead, such as youtube.com/@yourchannel.");
    throw new Error(PROMPTS.youtube);
  }
  if (/^\/(watch|shorts|live|embed|playlist)\b/i.test(url.pathname)) {
    throw new Error("That's a video link. Paste the channel link instead, such as youtube.com/@yourchannel.");
  }
  const match = url.pathname.match(/^\/(@[A-Za-z0-9._-]{2,100}|channel\/UC[A-Za-z0-9_-]{20,30}|c\/[A-Za-z0-9._-]{1,100}|user\/[A-Za-z0-9._-]{1,100})(\/.*)?$/);
  if (!match) throw new Error(PROMPTS.youtube);
  return `https://www.youtube.com/${match[1]}`;
}

const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "direct", "about", "developer", "legal"]);

export function normalizeInstagram(raw: string): string {
  const trimmed = raw.trim();
  const bare = trimmed.match(/^@?([A-Za-z0-9._]{1,30})$/);
  let username: string | null = bare && !trimmed.includes(".com") ? bare[1] : null;
  if (!username) {
    const url = toUrl(trimmed, "instagram");
    assertPlainWeb(url, "instagram");
    const host = url.hostname.toLowerCase();
    if (!["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)) throw new Error(PROMPTS.instagram);
    const match = url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?/);
    if (!match) throw new Error(PROMPTS.instagram);
    username = match[1];
  }
  if (INSTAGRAM_RESERVED.has(username.toLowerCase())) {
    throw new Error("That's a post or page link. Paste the profile instead, such as instagram.com/yourname.");
  }
  if (/^\.|\.$|\.\./.test(username)) throw new Error(PROMPTS.instagram);
  return `https://www.instagram.com/${username.toLowerCase()}/`;
}

export function instagramUsername(canonical: string): string {
  return canonical.replace(/^https:\/\/www\.instagram\.com\//, "").replace(/\/$/, "");
}
