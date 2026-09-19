import { describe, expect, it } from "vitest";
import { MAX_SPONSOR_LOGO_BYTES, validateSponsorAssetBytes } from "../src/sponsor-assets";

describe("sponsor logo build contract", () => {
  it("accepts a genuine local PNG within the public upload bound", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateSponsorAssetBytes("sponsors/approved.png", png)).not.toThrow();
  });

  it("rejects a logo larger than 10 MB before it enters the static artifact", () => {
    const png = new Uint8Array(MAX_SPONSOR_LOGO_BYTES + 1);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateSponsorAssetBytes("sponsors/oversized.png", png)).toThrow(/exceeds 10 MB/);
  });
});
