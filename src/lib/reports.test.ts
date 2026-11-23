import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSettings, type Settings } from "./settings";

// In-memory store so tests never touch disk.
const mem = new Map<string, unknown>();
vi.mock("./store", () => {
  const store = {
    get: async (key: string) => (mem.has(key) ? { data: mem.get(key), etag: "e" } : null),
    set: async (key: string, data: unknown) => (mem.set(key, data), true),
    list: async (prefix: string) => [...mem.keys()].filter((k) => k.startsWith(prefix)),
    delete: async (key: string) => void mem.delete(key),
  };
  return {
    kv: () => store,
    mutate: async (key: string, fn: (current: unknown) => unknown) => {
      const next = fn(mem.get(key) ?? null);
      if (next !== undefined) mem.set(key, next);
      return next ?? null;
    },
  };
});

const gatherEvidence = vi.fn();
vi.mock("./sources", () => ({ gatherEvidence: (...args: unknown[]) => gatherEvidence(...args) }));
vi.mock("./ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai")>()),
  writeReport: async () => ({ readerName: null, opening: "Hi", sections: [{ number: 1, title: "t", summary: "s", items: [] }], usage: { costUsd: 0 }, model: "m" }),
}));
vi.mock("./sources/apify", async (importOriginal) => ({ ...(await importOriginal<typeof import("./sources/apify")>()), apifyCost: async () => 0 }));

const { createReport, getReport, runReport } = await import("./reports");

function settingsWith(type: string): Settings {
  const yaml = readFileSync(path.join(__dirname, "../../examples/second-act-map.yaml"), "utf8").replace("type: linkedin", `type: ${type}`);
  const parsed = parseSettings(yaml);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.settings;
}

const evidence = { source: "facebook", url: "u", subject: { name: null, handle: null }, facts: ["x"], blocks: [{ label: "l", text: "t".repeat(900) }], linkedWebsite: null, linkedChannels: [], apifyRunIds: [], strength: "rich" };

describe("runReport with the detected source kind", () => {
  beforeEach(() => {
    mem.clear();
    gatherEvidence.mockReset();
    gatherEvidence.mockResolvedValue(evidence);
  });

  it("any-mode settings run a facebook record", async () => {
    const record = await createReport({ mode: "sent", source: "facebook", url: "https://www.facebook.com/someone" });
    await runReport(record.id, settingsWith("any"));
    expect(gatherEvidence).toHaveBeenCalledWith(expect.anything(), "facebook", "https://www.facebook.com/someone", {});
    expect((await getReport(record.id))?.status).toBe("complete");
  });

  it("fixed settings still refuse a different kind", async () => {
    const record = await createReport({ mode: "sent", source: "facebook", url: "https://www.facebook.com/someone" });
    await runReport(record.id, settingsWith("website"));
    const after = await getReport(record.id);
    expect(after?.errorCode).toBe("source_changed");
    expect(gatherEvidence).not.toHaveBeenCalled();
  });
});
