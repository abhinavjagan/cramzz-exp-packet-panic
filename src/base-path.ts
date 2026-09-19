export function normalizeBase(value: string | undefined): string {
  const requested = value?.trim() || "/e/packet-panic/";
  const path = requested.replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}
