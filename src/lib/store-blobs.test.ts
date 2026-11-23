import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Netlify store: records which "token" each connection was opened with.
let token = "t1";
const opened: string[] = [];
function fakeStore() {
  const myToken = token;
  opened.push(myToken);
  return {
    getWithMetadata: async () => ({ data: { token: myToken }, etag: "e" }),
    setJSON: async () => ({ modified: true }),
    list: async () => ({ blobs: [] }),
    delete: async () => undefined,
  };
}
const getStore = vi.fn(() => fakeStore());
const getDeployStore = vi.fn(() => fakeStore());
vi.mock("@netlify/blobs", () => ({ getStore: (...a: unknown[]) => getStore(...(a as [])), getDeployStore: (...a: unknown[]) => getDeployStore(...(a as [])) }));

process.env.NETLIFY_BLOBS_CONTEXT = "test-context";
const { kv } = await import("./store");

describe("Netlify Blobs connection", () => {
  beforeEach(() => {
    opened.length = 0;
    getStore.mockClear();
  });

  it("opens a fresh connection for every operation, so an expired token is never reused", async () => {
    const store = kv();
    token = "t1";
    expect((await store.get<{ token: string }>("a"))?.data.token).toBe("t1");
    token = "t2"; // Netlify hands the next request a new token
    expect((await store.get<{ token: string }>("a"))?.data.token).toBe("t2");
    await store.set("a", {});
    await store.list("a");
    await store.delete("a");
    expect(getStore).toHaveBeenCalledTimes(5);
  });
});
