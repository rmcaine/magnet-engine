import { describe, expect, it } from "vitest";
import { storeScope } from "./store";

describe("storeScope", () => {
  it("uses the shared site store unless told otherwise", () => {
    expect(storeScope({})).toBe("site");
    expect(storeScope({ MAGNET_STORE_SCOPE: "" })).toBe("site");
    expect(storeScope({ MAGNET_STORE_SCOPE: "site" })).toBe("site");
  });
  it("gives a deploy preview its own store when MAGNET_STORE_SCOPE=deploy", () => {
    expect(storeScope({ MAGNET_STORE_SCOPE: "deploy" })).toBe("deploy");
    expect(storeScope({ MAGNET_STORE_SCOPE: " Deploy " })).toBe("deploy");
  });
});
