export const MAX_SPONSOR_LOGO_BYTES = 10 * 1024 * 1024;

export function validateSponsorAssetBytes(path: string, bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_SPONSOR_LOGO_BYTES) {
    throw new Error(`Sponsor logo exceeds 10 MB: public/${path}`);
  }

  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => bytes[index] === byte);
  const isWebp = ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  if (path.endsWith(".png") ? !isPng : !isWebp) {
    throw new Error(`Sponsor logo content does not match its extension: public/${path}`);
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
