import { describe, expect, it } from "vitest";
import { detectSource, normalizeFacebook, normalizeInstagram, normalizeLinkedIn, normalizeWebsite, normalizeYouTube, resolveSource } from "./source-urls";

describe("normalizeWebsite", () => {
  it("accepts plain domains and full URLs", () => {
    expect(normalizeWebsite("newsletterlabs.co")).toBe("https://newsletterlabs.co");
    expect(normalizeWebsite("http://www.example.com/about/")).toBe("https://www.example.com/about");
  });
  it("refuses private and odd targets", () => {
    for (const bad of ["localhost", "http://127.0.0.1", "http://10.0.0.5/admin", "http://[::1]/", "http://169.254.169.254/latest", "router.local", "ftp://example.com", "https://user:pw@example.com", "https://example.com:8080", "intranet"]) {
      expect(() => normalizeWebsite(bad), bad).toThrow();
    }
  });
  it("points social links to the right input", () => {
    expect(() => normalizeWebsite("https://www.linkedin.com/in/someone")).toThrow(/social profile/);
  });
});

describe("normalizeLinkedIn", () => {
  it("keeps only /in/ profiles", () => {
    expect(normalizeLinkedIn("linkedin.com/in/justinglover/")).toBe("https://www.linkedin.com/in/justinglover");
    expect(normalizeLinkedIn("https://uk.linkedin.com/in/jane-doe-123")).toBe("https://www.linkedin.com/in/jane-doe-123");
    expect(() => normalizeLinkedIn("https://www.linkedin.com/company/acme")).toThrow(/company page/);
    expect(() => normalizeLinkedIn("https://evil.com/in/x")).toThrow();
  });
});

describe("normalizeYouTube", () => {
  it("accepts handles and channel ids", () => {
    expect(normalizeYouTube("youtube.com/@mkbhd/videos")).toBe("https://www.youtube.com/@mkbhd");
    expect(normalizeYouTube("@mkbhd")).toBe("https://www.youtube.com/@mkbhd");
    expect(normalizeYouTube("https://m.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ")).toBe("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ");
  });
  it("explains video links", () => {
    expect(() => normalizeYouTube("https://www.youtube.com/watch?v=abc")).toThrow(/video link/);
    expect(() => normalizeYouTube("https://youtu.be/abc")).toThrow(/video link/);
  });
});

describe("normalizeInstagram", () => {
  it("accepts usernames and profile links", () => {
    expect(normalizeInstagram("@HubSpot")).toBe("https://www.instagram.com/hubspot/");
    expect(normalizeInstagram("instagram.com/hubspot?igsh=abc")).toBe("https://www.instagram.com/hubspot/");
    expect(() => normalizeInstagram("https://www.instagram.com/p/Cxyz/")).toThrow(/post/);
    expect(() => normalizeInstagram("https://example.com/hubspot")).toThrow();
  });
});

describe("normalizeFacebook", () => {
  it("canonicalizes usernames", () => {
    expect(normalizeFacebook("facebook.com/bob.caine.1650/")).toBe("https://www.facebook.com/bob.caine.1650");
    expect(normalizeFacebook("https://m.facebook.com/Some.Name")).toBe("https://www.facebook.com/Some.Name");
    expect(normalizeFacebook("fb.com/someone")).toBe("https://www.facebook.com/someone");
  });
  it("keeps profile.php ids", () => {
    expect(normalizeFacebook("https://www.facebook.com/profile.php?id=1000123&sk=about")).toBe("https://www.facebook.com/profile.php?id=1000123");
  });
  it("refuses non-profile links", () => {
    for (const bad of ["facebook.com/share/abc123", "facebook.com/groups/123", "facebook.com/events/9", "facebook.com/reel/111", "facebook.com/photo/?fbid=1", "facebook.com/someone/posts/pfbid0x", "facebook.com/watch"]) {
      expect(() => normalizeFacebook(bad), bad).toThrow(/profile link/);
    }
  });
});

describe("detectSource", () => {
  it("routes by host", () => {
    expect(detectSource("linkedin.com/in/jane-doe").type).toBe("linkedin");
    expect(detectSource("youtube.com/@chan").type).toBe("youtube");
    expect(detectSource("instagram.com/someone").type).toBe("instagram");
    expect(detectSource("facebook.com/someone")).toEqual({ type: "facebook", url: "https://www.facebook.com/someone" });
    expect(detectSource("bobcaine.com")).toEqual({ type: "website", url: "https://bobcaine.com" });
  });
  it("asks for a full link for a bare handle", () => {
    expect(() => detectSource("@someone")).toThrow(/full link/);
  });
  it("passes through the per-site errors", () => {
    expect(() => detectSource("linkedin.com/company/acme")).toThrow(/company page/);
  });
});

describe("resolveSource", () => {
  it("with a fixed type ignores detection", () => {
    expect(resolveSource("website", "bobcaine.com")).toEqual({ type: "website", url: "https://bobcaine.com" });
    expect(() => resolveSource("website", "facebook.com/x")).toThrow(/social profile/);
  });
  it("with any detects", () => {
    expect(resolveSource("any", "facebook.com/someone").type).toBe("facebook");
  });
});

describe("review fixes: facebook links that aren't profiles", () => {
  it("refuses .php links other than profile.php", () => {
    for (const bad of ["facebook.com/photo.php?fbid=1", "facebook.com/video.php?v=2", "facebook.com/sharer.php?u=x", "facebook.com/home.php"]) {
      expect(() => normalizeFacebook(bad), bad).toThrow(/profile link/);
    }
  });
  it("refuses pixel, sharer, plugin and namespace links", () => {
    for (const bad of ["facebook.com/tr?id=123", "facebook.com/sharer", "facebook.com/plugins", "facebook.com/dialog", "http://www.facebook.com/2008/fbml", "facebook.com/2008"]) {
      expect(() => normalizeFacebook(bad), bad).toThrow();
    }
  });
  it("asks for a full link for an @handle with a dot", () => {
    expect(() => detectSource("@jane.doe")).toThrow(/full link/);
  });
});
