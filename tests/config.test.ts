import { describe, expect, it } from "vitest";
import { normalizeBase } from "../src/base-path";

describe("base-path configuration", () => {
  it("keeps the experiment mount as the default", () => {
    expect(normalizeBase(undefined)).toBe("/e/packet-panic/");
    expect(normalizeBase("")).toBe("/e/packet-panic/");
  });

  it("normalizes nested mounts without duplicate slashes", () => {
    expect(normalizeBase("e/packet-panic")).toBe("/e/packet-panic/");
    expect(normalizeBase("///e/packet-panic///")).toBe("/e/packet-panic/");
  });

  it("preserves the root mount used by the standalone Render preview", () => {
    expect(normalizeBase("/")).toBe("/");
    expect(normalizeBase("///")).toBe("/");
  });
});
